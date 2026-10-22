const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare } = require('./prepare-seed.cjs');
const inventory = require('./inventory.json');
const proposals = require('./category-proposals.json');

test('reconciles the inventory and preserves pending quantities and authors', () => {
  const seed = prepare(inventory, proposals);
  assert.deepEqual(seed.summary, {
    books: 384,
    copies: 426,
    categories: 102,
    proposedClassifications: 379,
    unclassifiedBooks: 5,
    missingAuthors: 29,
    unknownQuantities: 3,
  });
  assert.equal(seed.approvedForProduction, true);
  for (const number of ['00169', '00383', '00384']) {
    const book = seed.books.find((item) => item.registrationNumber === number);
    assert.equal(
      seed.copies.filter((copy) => copy.bookId === book.id).length,
      0,
    );
  }
  assert.equal(
    seed.books.find((item) => item.registrationNumber === '00006').author,
    null,
  );
  assert(seed.books.every((book) => book.language === 'und'));
});

test('preserves category hierarchy, separate editions and stable IDs', () => {
  const seed = prepare(inventory, proposals);
  assert(seed.categories.some((item) => item.code === '00'));
  assert.equal(
    seed.categories.find((item) => item.code === '522').parentCode,
    '52',
  );
  const editions = seed.books.filter((book) =>
    ['00333', '00334'].includes(book.registrationNumber),
  );
  assert.equal(editions.length, 2);
  assert.notEqual(editions[0].id, editions[1].id);
  assert.deepEqual(seed, prepare(inventory, proposals));
  assert.equal(
    new Set(seed.copies.map((copy) => copy.assetCode)).size,
    seed.copies.length,
  );
  assert(
    seed.copies.every(
      (copy) => copy.status === 'PENDING_INVENTORY' && copy.shelfmark === null,
    ),
  );
  assert(seed.bookCategories.every((item) => item.reviewedAt === null));
});

test('rejects invalid counts, repeated register numbers and broken category links', () => {
  const badCount = structuredClone(inventory);
  badCount.expected.cachedWorkbookTotal++;
  assert.throws(() => prepare(badCount, proposals), /J2/);
  const duplicate = structuredClone(inventory);
  duplicate.books.push(duplicate.books[0]);
  assert.throws(() => prepare(duplicate, proposals), /Duplicate registration/);
  const unknown = structuredClone(proposals);
  unknown.assignments[0].primaryCategoryCode = '999';
  assert.throws(() => prepare(inventory, unknown), /Unknown category/);
  const cycle = structuredClone(inventory);
  cycle.categories.find((item) => item.code === '52').parentCode = '522';
  assert.throws(() => prepare(cycle, proposals), /cycle/);
});
