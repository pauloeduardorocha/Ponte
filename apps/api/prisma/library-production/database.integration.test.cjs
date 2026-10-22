const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connect, migrate, load, countsSql } = require('./database.cjs');

test('migrates, resets and imports atomically on an explicitly selected test branch', async () => {
  assert.equal(
    process.env.LIBRARY_TEST_DATABASE,
    '1',
    'Run only on the isolated test database',
  );
  const sql = connect();
  const external = () =>
    sql.query(
      'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM members) AS members',
    );
  const original = await external();
  await migrate(sql);
  await load(sql, true);
  assert.deepEqual(await external(), original);
  const state = await sql.query(countsSql);
  assert.deepEqual(state[0], {
    books: 384,
    copies: 426,
    loans: 0,
    reservations: 0,
    fines: 0,
    payments: 0,
    adjustments: 0,
  });
  await load(sql, false);
  assert.deepEqual(await sql.query(countsSql), state);

  const auditBefore = await sql.query(
    'SELECT count(*) AS total FROM audit_logs',
  );
  await assert.rejects(() => load(sql, true, true));
  assert.deepEqual(await sql.query(countsSql), state);
  assert.deepEqual(
    await sql.query('SELECT count(*) AS total FROM audit_logs'),
    auditBefore,
  );

  const [row] = await sql.query(`SELECT
    (SELECT count(*)::int FROM library_books WHERE author IS NULL) AS missing,
    (SELECT count(*)::int FROM library_copies WHERE status='PENDING_INVENTORY') AS pending,
    (SELECT count(*)::int FROM library_books WHERE "registrationNumber" IN ('00333','00334')) AS editions,
    (SELECT count(*)::int FROM library_book_categories WHERE "reviewedAt" IS NULL) AS proposed`);
  assert.deepEqual(row, {
    missing: 29,
    pending: 426,
    editions: 2,
    proposed: 379,
  });
  const unknown =
    await sql.query(`SELECT b."registrationNumber",count(c.id)::int AS copies FROM library_books b
    LEFT JOIN library_copies c ON c."bookId"=b.id WHERE b."registrationNumber" IN ('00169','00383','00384')
    GROUP BY b."registrationNumber" ORDER BY b."registrationNumber"`);
  assert.equal(unknown.length, 3);
  assert(unknown.every((item) => item.copies === 0));

  const [book] = await sql.query(
    'SELECT "bookId" FROM library_book_categories WHERE "isPrimary" LIMIT 1',
  );
  await assert.rejects(
    () =>
      sql.query(
        `INSERT INTO library_book_categories(id,"bookId","categoryCode","isPrimary") VALUES ($1,$2,'01',true)`,
        [randomUUID(), book.bookId],
      ),
    { code: '23505' },
  );
  await assert.rejects(
    () =>
      sql.query(
        `INSERT INTO library_book_categories(id,"bookId","categoryCode") VALUES ($1,$2,'999')`,
        [randomUUID(), book.bookId],
      ),
    { code: '23503' },
  );
  const [grants] = await sql.query(`SELECT
    has_table_privilege('church_app','library_categories','SELECT') AS categories,
    has_table_privilege('church_app','library_book_categories','SELECT') AS assignments,
    has_table_privilege('church_app','library_categories','INSERT') AS create_category`);
  assert.equal(grants.categories, true);
  assert.equal(grants.assignments, true);
  assert.equal(grants.create_category, true);
});
