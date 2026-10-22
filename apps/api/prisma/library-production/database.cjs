// Explicit, operator-run database tasks. No credentials or .env auto-loading.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { neon } = require('@neondatabase/serverless');
const { prepare, stableId } = require('./prepare-seed.cjs');
const migration = '20261022120000_library_catalogue';

function connect() {
  if (!process.env.DATABASE_URL || !process.env.LIBRARY_EXPECT_HOST)
    throw new Error('Supply DATABASE_URL and LIBRARY_EXPECT_HOST explicitly');
  const target = new URL(process.env.DATABASE_URL);
  if (
    target.hostname !== process.env.LIBRARY_EXPECT_HOST ||
    target.pathname !== '/neondb'
  )
    throw new Error(
      'Database target does not match the explicit expected host and database',
    );
  return neon(process.env.DATABASE_URL);
}

async function migrate(sql) {
  const file = path.join(
    __dirname,
    '../migrations',
    migration,
    'migration.sql',
  );
  const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(source).digest('hex');
  const previous = await sql.query(
    'SELECT checksum, finished_at FROM _prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',
    [migration],
  );
  if (previous.length) {
    const crlfChecksum = createHash('sha256')
      .update(source.replace(/\n/g, '\r\n'))
      .digest('hex');
    if (
      previous.length !== 1 ||
      ![checksum, crlfChecksum].includes(previous[0].checksum) ||
      !previous[0].finished_at
    )
      throw new Error('Migration state or checksum mismatch');
    return { migration, alreadyApplied: true };
  }
  // This reviewed migration has no SQL function bodies or semicolons in strings.
  const statements = source
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const grants = fs.readFileSync(
    path.join(__dirname, '../runtime-privileges.sql'),
    'utf8',
  );
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement, [])),
    sql.query(grants, []),
    sql.query(
      'INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1,$2,$3,now(),now(),1)',
      [randomUUID(), checksum, migration],
    ),
  ]);
  return { migration, applied: true };
}

const countsSql = `SELECT
 (SELECT count(*)::int FROM library_books) AS books,
 (SELECT count(*)::int FROM library_copies) AS copies,
 (SELECT count(*)::int FROM library_loans) AS loans,
 (SELECT count(*)::int FROM library_reservations) AS reservations,
 (SELECT count(*)::int FROM library_fines) AS fines,
 (SELECT count(*)::int FROM library_fine_payments) AS payments,
 (SELECT count(*)::int FROM library_fine_adjustments) AS adjustments`;

async function load(sql, reset = false, failAtEnd = false) {
  const inventory = require('./inventory.json');
  const proposals = require('./category-proposals.json');
  const seed = prepare(inventory, proposals);
  const before = await sql.query(countsSql, []);
  const statements = [
    sql.query('SELECT pg_advisory_xact_lock(716023,1)', []),
    sql.query(
      `LOCK TABLE library_books,library_copies,library_book_categories,library_categories,
      library_loans,library_reservations,library_fines,library_fine_payments,library_fine_adjustments,library_settings IN ACCESS EXCLUSIVE MODE`,
      [],
    ),
    sql.query(
      "SELECT set_config('app.audit_agent','library-inventory-v1',true)",
      [],
    ),
  ];
  if (reset) {
    // Only library-owned operational tables; immutable global audit stays intact.
    for (const table of [
      'library_fine_payments',
      'library_fine_adjustments',
      'library_fines',
      'library_reservations',
      'library_loans',
      'library_book_categories',
      'library_copies',
      'library_books',
    ])
      statements.push(sql.query(`DELETE FROM ${table}`, []));
    // Clear child pointers first so the self-referencing FK cannot block the reset.
    statements.push(
      sql.query('UPDATE library_categories SET "parentCode"=NULL', []),
    );
    statements.push(sql.query('DELETE FROM library_categories', []));
    statements.push(sql.query('DELETE FROM library_settings', []));
    statements.push(
      sql.query(
        'INSERT INTO library_settings (id,"updatedAt") VALUES (1,now())',
        [],
      ),
    );
  }
  statements.push(
    sql.query(
      `INSERT INTO library_categories(id,code,name,"parentCode")
    SELECT id,code,name,"parentCode" FROM jsonb_to_recordset($1::jsonb)
    AS x(id uuid,code text,name text,"parentCode" text) ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(seed.categories)],
    ),
  );
  statements.push(
    sql.query(
      `INSERT INTO library_books(id,"registrationNumber",title,author,collection,"catalogueNotes",language,category,"updatedAt")
    SELECT id,"registrationNumber",title,author,collection,"catalogueNotes",language,category,now()
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,"registrationNumber" text,title text,author text,collection text,"catalogueNotes" text,language text,category text)
    ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(seed.books)],
    ),
  );
  statements.push(
    sql.query(
      `INSERT INTO library_book_categories(id,"bookId","categoryCode","isPrimary","reviewedAt")
    SELECT id,"bookId","categoryCode","isPrimary",NULL FROM jsonb_to_recordset($1::jsonb)
    AS x(id uuid,"bookId" uuid,"categoryCode" text,"isPrimary" boolean) ON CONFLICT (id) DO NOTHING`,
      [
        JSON.stringify(
          seed.bookCategories.map((item) => ({
            ...item,
            id: stableId('assignment', `${item.bookId}/${item.categoryCode}`),
          })),
        ),
      ],
    ),
  );
  statements.push(
    sql.query(
      `INSERT INTO library_copies(id,"bookId","assetCode",shelfmark,location,condition,status,"updatedAt")
    SELECT id,"bookId","assetCode",shelfmark,location,condition,status::"CopyStatus",now()
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,"bookId" uuid,"assetCode" text,shelfmark text,location text,condition text,status text)
    ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(seed.copies)],
    ),
  );
  // SQL assertion inside the same transaction: count mismatch rolls back the reset too.
  statements.push(
    sql.query(
      `DO $verify$ BEGIN
    IF (SELECT count(*) FROM library_books) <> 384 OR (SELECT count(*) FROM library_copies) <> 426
      OR (SELECT count(*) FROM library_categories) <> 102
      OR (SELECT count(*) FROM library_book_categories) <> 379 THEN
      RAISE EXCEPTION 'Library seed counts do not reconcile';
    END IF;
  END $verify$`,
      [],
    ),
  );
  statements.push(
    sql.query(
      `INSERT INTO audit_logs (id,action,entity_type,entity_id,metadata)
    VALUES ($1,$2,'LibraryImport',$3,$4::jsonb)`,
      [
        randomUUID(),
        reset ? 'LIBRARY_RESET_SEED' : 'LIBRARY_SEED_VERIFY',
        'inventory-v1',
        JSON.stringify({
          before: before[0],
          after: seed.summary,
          sourceFiles: seed.sourceFiles,
        }),
      ],
    ),
  );
  if (failAtEnd) statements.push(sql.query('SELECT 1/0', []));
  const results = await sql.transaction([
    ...statements,
    sql.query(countsSql, []),
  ]);
  return {
    before: before[0],
    after: results.at(-1)[0],
    categories: seed.summary.categories,
    proposedClassifications: seed.summary.proposedClassifications,
  };
}

async function main() {
  const action = process.argv[2];
  if (!['inspect', 'migrate', 'seed', 'reset-seed'].includes(action))
    throw new Error('Usage: database.cjs inspect|migrate|seed|reset-seed');
  const sql = connect();
  const result =
    action === 'inspect'
      ? await sql.query(countsSql, [])
      : action === 'migrate'
        ? await migrate(sql)
        : await load(sql, action === 'reset-seed');
  console.log(JSON.stringify({ action, result }, null, 2));
}
if (require.main === module)
  main().catch((error) => {
    const message = String(error.message)
      .replaceAll(process.env.DATABASE_URL ?? '\0', '[connection hidden]')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[connection hidden]');
    console.error(
      JSON.stringify({ task: 'library-database', code: error.code, message }),
    );
    process.exitCode = 1;
  });
module.exports = { connect, migrate, load, countsSql };
