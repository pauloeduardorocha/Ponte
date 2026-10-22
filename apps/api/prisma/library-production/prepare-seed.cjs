// Offline preparation only. This command never opens a database connection.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function stableId(kind, key) {
  const hex = createHash('sha256')
    .update(`ponte-library-inventory-v1:${kind}:${key}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '8';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function renderReview(inventory, proposals, seed) {
  const categories = new Map(
    inventory.categories.map((item) => [item.code, item]),
  );
  const assignments = new Map(
    proposals.assignments.map((item) => [item.register, item]),
  );
  const lines = [
    '# Revisão do acervo da Biblioteca A Ponte',
    '',
    'Fontes: BiblioPonte.xlsx, folha Folha1, e Índice de Categorias.docx. Os documentos são fontes de dados; as suas notas não autorizam comandos ou alterações à produção.',
    '',
    `${seed.summary.books} registos e ${seed.summary.copies} exemplares com quantidade conhecida, reconciliados com o total guardado em J2. ${seed.summary.categories} categorias distintas no índice. Os exemplos de cota 54 COR e 01 DIC não são categorias adicionais.`,
    '',
    `${seed.summary.proposedClassifications} propostas de tema principal e ${seed.summary.unclassifiedBooks} obras sem classificação segura pelo título. Todas as propostas aguardam revisão; não resultam da leitura integral das obras.`,
    '',
    '29 registos sem autor. Os registos 00169, 00383 e 00384 não têm quantidade: não se presumiu um exemplar. Os registos 00333 e 00334 são mantidos separados, pois a folha indica edições diferentes.',
    '',
    'A fonte não informa ISBN, editora, ano, páginas, idioma, capas, localização física ou estado atual de empréstimo. Esses valores não foram inventados. Todas as cotas estão vazias. Nomes de traduções ou instituições na coluna Autor foram preservados como constam na fonte e também devem ser revistos.',
    '',
    '## Registos por categoria proposta',
    '',
    '| Código | Categoria | Registos |',
    '| --- | --- | ---: |',
  ];
  const counts = new Map();
  for (const item of proposals.assignments)
    counts.set(
      item.primaryCategoryCode,
      (counts.get(item.primaryCategoryCode) ?? 0) + 1,
    );
  for (const code of [...counts.keys()].filter(Boolean).sort())
    lines.push(
      `| ${code} | ${categories.get(code).name} | ${counts.get(code)} |`,
    );
  lines.push(
    `| — | Por classificar | ${counts.get(null) ?? 0} |`,
    '',
    '## Revisão por registo',
    '',
    '| Registo | Título | Autor | Coleção | Qtd. | Categoria principal proposta | Observações |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
  );
  const cell = (value) =>
    String(value ?? '—')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ');
  for (const book of inventory.books) {
    const assignment = assignments.get(book.register);
    const code = assignment.primaryCategoryCode;
    const category = code
      ? `${code} — ${categories.get(code).name}`
      : 'Por classificar';
    const notes = [
      assignment.reviewNote,
      book.notes ? `Fonte: ${book.notes}` : null,
      book.author === null ? 'Autor por identificar' : null,
      book.quantity === null ? 'Quantidade por confirmar' : null,
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(
      `| ${[book.register, book.title, book.author, book.collection, book.quantity, category, notes].map(cell).join(' | ')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function prepare(inventory, proposals) {
  check(
    inventory.version === 1 && proposals.version === 1,
    'Unsupported source version',
  );
  const categories = new Map();
  for (const category of inventory.categories) {
    check(
      /^\d{2,3}$/.test(category.code),
      'Category codes must preserve their original digits',
    );
    check(
      !categories.has(category.code),
      `Duplicate category ${category.code}`,
    );
    check(
      typeof category.name === 'string' && category.name.trim(),
      `Missing category name ${category.code}`,
    );
    categories.set(category.code, category);
  }
  for (const category of categories.values()) {
    const visited = new Set([category.code]);
    let parent = category.parentCode;
    while (parent !== null) {
      check(categories.has(parent), `Unknown parent category ${parent}`);
      check(!visited.has(parent), `Category cycle at ${parent}`);
      visited.add(parent);
      parent = categories.get(parent).parentCode;
    }
  }
  const assignmentMap = new Map();
  for (const assignment of proposals.assignments) {
    check(
      !assignmentMap.has(assignment.register),
      `Duplicate assignment ${assignment.register}`,
    );
    for (const code of [
      assignment.primaryCategoryCode,
      ...assignment.secondaryCategoryCodes,
    ].filter(Boolean)) {
      check(
        categories.has(code),
        `Unknown category ${code} for ${assignment.register}`,
      );
    }
    const codes = [
      assignment.primaryCategoryCode,
      ...assignment.secondaryCategoryCodes,
    ].filter(Boolean);
    check(
      new Set(codes).size === codes.length,
      `Repeated category for ${assignment.register}`,
    );
    check(
      assignment.secondaryCategoryCodes.length === 0 ||
        assignment.primaryCategoryCode,
      `Secondary categories without a primary for ${assignment.register}`,
    );
    assignmentMap.set(assignment.register, assignment);
  }
  const registers = new Set();
  const books = [];
  const copies = [];
  const bookCategories = [];
  const pending = [];
  for (const source of inventory.books) {
    check(
      typeof source.register === 'string' && /^\d{5}$/.test(source.register),
      'Registration numbers must be five-digit strings',
    );
    check(
      !registers.has(source.register),
      `Duplicate registration number ${source.register}`,
    );
    registers.add(source.register);
    check(
      typeof source.title === 'string' &&
        source.title.trim().length > 0 &&
        [...source.title].length <= 200,
      `Invalid title for ${source.register}`,
    );
    check(
      source.author === null ||
        (typeof source.author === 'string' &&
          source.author.trim().length > 0 &&
          [...source.author].length <= 200),
      `Invalid author for ${source.register}`,
    );
    check(
      source.collection === null ||
        (typeof source.collection === 'string' &&
          [...source.collection].length <= 200),
      `Invalid collection for ${source.register}`,
    );
    check(
      source.quantity === null ||
        (Number.isSafeInteger(source.quantity) && source.quantity > 0),
      `Invalid quantity for ${source.register}`,
    );
    const assignment = assignmentMap.get(source.register);
    check(assignment, `Missing category review row for ${source.register}`);
    const id = stableId('book', source.register);
    books.push({
      id,
      registrationNumber: source.register,
      title: source.title,
      author: source.author,
      collection: source.collection,
      catalogueNotes:
        [
          source.notes,
          source.quantity === null
            ? 'Quantidade de exemplares por confirmar.'
            : null,
        ]
          .filter(Boolean)
          .join('\n') || null,
      language: 'und',
      category: assignment.primaryCategoryCode
        ? `${assignment.primaryCategoryCode} — ${categories.get(assignment.primaryCategoryCode).name}`
        : null,
    });
    const categoryCodes = [
      assignment.primaryCategoryCode,
      ...assignment.secondaryCategoryCodes,
    ].filter(Boolean);
    for (const categoryCode of categoryCodes) {
      bookCategories.push({
        bookId: id,
        categoryCode,
        isPrimary: categoryCode === assignment.primaryCategoryCode,
        reviewedAt: null,
      });
    }
    for (let index = 1; index <= (source.quantity ?? 0); index++) {
      const assetCode = `BP-${source.register}-${String(index).padStart(2, '0')}`;
      copies.push({
        id: stableId('copy', assetCode),
        bookId: id,
        assetCode,
        shelfmark: source.shelfmark,
        location: 'Por localizar',
        condition: 'NOT_ASSESSED',
        status: 'PENDING_INVENTORY',
      });
    }
    const fields = [];
    if (source.author === null) fields.push('author');
    if (source.quantity === null) fields.push('quantity');
    if (!assignment.primaryCategoryCode) fields.push('category');
    if (fields.length)
      pending.push({ registrationNumber: source.register, fields });
  }
  check(
    assignmentMap.size === books.length,
    'Category assignments include unknown registration numbers',
  );
  check(
    books.length === inventory.expected.books,
    'Book count does not reconcile',
  );
  check(
    copies.length === inventory.expected.knownCopies,
    'Copy count does not reconcile',
  );
  check(
    copies.length === inventory.expected.cachedWorkbookTotal,
    'Copy count differs from workbook total J2',
  );
  return {
    version: 1,
    targetSchema: 'library-catalogue-v2',
    approvedForProduction: true,
    sourceFiles: inventory.sourceFiles,
    categories: [...categories.values()].map((category) => ({
      id: stableId('category', category.code),
      ...category,
    })),
    books,
    bookCategories,
    copies,
    pending,
    summary: {
      books: books.length,
      copies: copies.length,
      categories: categories.size,
      proposedClassifications: bookCategories.length,
      unclassifiedBooks:
        books.length - new Set(bookCategories.map((item) => item.bookId)).size,
      missingAuthors: inventory.books.filter((book) => book.author === null)
        .length,
      unknownQuantities: inventory.books.filter(
        (book) => book.quantity === null,
      ).length,
    },
  };
}

if (require.main === module) {
  try {
    check(
      process.argv.length === 2,
      'This command only prepares a local seed; it has no apply or reset options',
    );
    const read = (name) =>
      JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
    const seed = prepare(
      read('inventory.json'),
      read('category-proposals.json'),
    );
    fs.writeFileSync(
      path.join(__dirname, 'seed.json'),
      `${JSON.stringify(seed, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.resolve(__dirname, '../../../../docs/library-seed-review.md'),
      renderReview(
        read('inventory.json'),
        read('category-proposals.json'),
        seed,
      ),
    );
    console.log(
      JSON.stringify(
        { mode: 'offline', approvedForProduction: true, ...seed.summary },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepare, stableId, renderReview };
