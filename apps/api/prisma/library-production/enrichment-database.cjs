// Explicit administration task. Inject DATABASE_URL and LIBRARY_EXPECT_HOST.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { connect } = require('./database.cjs');
const migration = '20261022213000_library_enrichment';
const fields = ['author','isbn','publisher','edition','year','language','pages','cover','subtitle','keywords'];
async function readBooks(sql) {
  return (await sql.query('SELECT to_jsonb(b) AS data FROM library_books b ORDER BY "registrationNumber"',[])).map(r=>r.data);
}

function changes(plan, current, imported) {
  const byRegistration = new Map(current.map(b => [b.registrationNumber,b]));
  const used = new Set(current.map(b => b.isbn).filter(Boolean));
  const result = [];
  assert.equal(new Set(plan.books.map(b => b.registrationNumber)).size,384);
  for(const item of plan.books) {
    const before = byRegistration.get(item.registrationNumber);
    assert.ok(before, `Missing production book ${item.registrationNumber}`);
    assert.equal(before.title,item.original.title,`Title changed: ${item.registrationNumber}`);
    if(imported.has(before.id)) {
      assert.equal(imported.get(before.id),plan.sourceHash,'Different research already imported');
      continue;
    }
    const selection = structuredClone(item.selection);
    const after = {...before};
    for(const field of fields) {
      const value = selection.fields[field];
      const empty = before[field] == null || before[field] === '' ||
        (field === 'language' && before[field] === 'und') ||
        (field === 'keywords' && !before.keywords.length);
      if(!empty || value == null) continue;
      if(field === 'isbn' && used.has(value)) {
        selection.isbnCollision = value;
        continue;
      }
      if(field === 'isbn') used.add(value);
      after[field] = value;
    }
    result.push({bookId:before.id,registrationNumber:item.registrationNumber,research:item.research,
      selection,previousValues:before,after,
      changed: fields.some(f => JSON.stringify(before[f]) !== JSON.stringify(after[f]))});
  }
  return result;
}

async function invariants(sql) {
  const tables = ['library_copies','library_loans','library_reservations','library_fines','library_fine_payments','library_fine_adjustments','library_categories','library_book_categories','library_settings'];
  const result = {};
  for(const table of tables) result[table] = (await sql.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(t::text,'' ORDER BY t::text),'')) AS hash FROM ${table} t`,[]))[0];
  return result;
}

async function apply(sql, plan, folder, failAtEnd=false) {
  const current = await readBooks(sql);
  const existingTable = (await sql.query("SELECT to_regclass('public.library_book_enrichments') IS NOT NULL AS exists",[]))[0].exists;
  const imported = new Map(existingTable ? (await sql.query('SELECT "bookId","sourceHash" FROM library_book_enrichments',[])).map(x => [x.bookId,x.sourceHash]) : []);
  const rows = changes(plan,current,imported);
  const beforeInvariant = await invariants(sql);
  fs.mkdirSync(folder,{recursive:true});
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  fs.writeFileSync(path.join(folder,`before-${stamp}.json`),JSON.stringify({books:current,invariants:beforeInvariant},null,2));
  const source = fs.readFileSync(path.join(__dirname,'../migrations',migration,'migration.sql'),'utf8').replace(/\r\n/g,'\n');
  const checksum = createHash('sha256').update(source).digest('hex');
  const applied = await sql.query('SELECT checksum,finished_at FROM _prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',[migration]);
  if(applied.length) assert.ok(applied.length===1 && applied[0].checksum===checksum && applied[0].finished_at,'Migration checksum mismatch');
  const queries = [sql.query('SELECT pg_advisory_xact_lock(716023,1)',[]),
    sql.query('LOCK TABLE library_books IN SHARE ROW EXCLUSIVE MODE',[]),
    sql.query("SELECT set_config('app.audit_agent','library-enrichment-v1',true)",[])];
  if(!applied.length) {
    queries.push(...source.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>sql.query(s,[])));
    queries.push(sql.query('INSERT INTO _prisma_migrations (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),now(),1)',[randomUUID(),checksum,migration]));
  }
  const payload=JSON.stringify(rows);
  queries.push(sql.query('CREATE TEMP TABLE enrichment_guard (valid boolean CHECK(valid)) ON COMMIT DROP',[]));
  queries.push(sql.query(`INSERT INTO enrichment_guard SELECT count(*)=$2::int FROM jsonb_array_elements($1::jsonb) x JOIN library_books b ON b.id=(x->>'bookId')::uuid AND to_jsonb(b)=x->'previousValues'`,[payload,rows.length]));
  queries.push(sql.query(`INSERT INTO library_book_enrichments("bookId","sourceHash",research,selection,"previousValues")
    SELECT (x->>'bookId')::uuid,$2,x->'research',x->'selection',x->'previousValues' FROM jsonb_array_elements($1::jsonb) x`,[payload,plan.sourceHash]));
  queries.push(sql.query(`UPDATE library_books b SET author=x.author,isbn=x.isbn,publisher=x.publisher,edition=x.edition,year=x.year,
    language=x.language,pages=x.pages,cover=x.cover,subtitle=x.subtitle,keywords=x.keywords,"updatedAt"=now()
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,author text,isbn text,publisher text,edition text,year int,language text,pages int,cover text,subtitle text,keywords text[])
    WHERE b.id=x.id RETURNING b.id`,[JSON.stringify(rows.filter(r=>r.changed).map(r=>r.after))]));
  if(rows.length) queries.push(sql.query(`INSERT INTO audit_logs(id,action,entity_type,entity_id,metadata) VALUES ($1,'IMPORT','LibraryEnrichment',$2,$3::jsonb)`,[randomUUID(),plan.sourceHash,JSON.stringify({sourceHash:plan.sourceHash,imported:rows.length,updated:rows.filter(r=>r.changed).length,provisional:true,methodology:plan.methodology})]));
  if(failAtEnd) queries.push(sql.query('SELECT 1/0',[]));
  try {
    await sql.transaction(queries);
    if(failAtEnd) throw new Error('Rollback test did not fail');
  } catch(error) {
    if(!failAtEnd || error.code !== '22012') throw error;
    assert.deepEqual(await readBooks(sql),current);
    assert.deepEqual(await invariants(sql),beforeInvariant);
    console.log(JSON.stringify({rollbackVerified:true,books:current.length}));
    return;
  }
  assert.deepEqual(await invariants(sql),beforeInvariant,'Operational library data changed');
  const after=await readBooks(sql);
  assert.equal(after.length,current.length);
  for(const row of rows) {
    const actual=after.find(b=>b.id===row.bookId);
    for(const field of fields) assert.deepEqual(actual[field],row.after[field],`${row.registrationNumber}/${field}`);
    for(const field of ['title','registrationNumber','collection','catalogueNotes','category','createdAt']) assert.deepEqual(actual[field],row.previousValues[field]);
  }
  const report={imported:rows.length,updated:rows.filter(r=>r.changed).length,isbnCollisions:rows.filter(r=>r.selection.isbnCollision).map(r=>({registrationNumber:r.registrationNumber,isbn:r.selection.isbnCollision})),
    books:after.length,withIsbn:after.filter(r=>r.isbn).length,withCover:after.filter(r=>r.cover).length,withPublisher:after.filter(r=>r.publisher).length,withPages:after.filter(r=>r.pages).length,
    withYear:after.filter(r=>r.year).length,withLanguage:after.filter(r=>r.language!=='und').length,withAuthor:after.filter(r=>r.author).length,operationalDataUnchanged:true,provisional:true,sourceHash:plan.sourceHash};
  fs.writeFileSync(path.join(folder,`result-${stamp}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  return report;
}

if(require.main===module) {
  const [action,input,folder]=process.argv.slice(2);
  if(!['apply','test-rollback'].includes(action) || !input || !folder) throw new Error('Usage: enrichment-database.cjs apply|test-rollback plan.json report-folder');
  apply(connect(),JSON.parse(fs.readFileSync(input,'utf8')),folder,action==='test-rollback').catch(error=>{
    console.error(JSON.stringify({code:error.code,message:String(error.message).replaceAll(process.env.DATABASE_URL || '\0','[hidden]').replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[hidden]')}));
    process.exitCode=1;
  });
}
module.exports={changes,apply};
