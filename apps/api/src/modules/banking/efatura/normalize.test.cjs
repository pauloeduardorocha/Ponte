const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInvoices } = require('./normalize.cjs');
const { validatePeriod, applyDateFilters } = require('./filters.cjs');
const headers = ['Emitente', 'NIF', 'Documento', 'Data', 'Total'];
const row = {
  cells: ['Energia', '123456789', 'FT/99', '07/10/2026', '1.234,56 €'],
  links: [
    {
      column: 2,
      url: 'https://faturas.portaldasfinancas.gov.pt/detalhe?id=99',
    },
  ],
};
test('normalizes Portuguese values and retains invoice links', () => {
  assert.equal(
    normalizeInvoices([row], headers, '987654321')[0].amount,
    '1234.56',
  );
  assert.equal(
    normalizeInvoices([row], headers, '987654321')[0].date,
    '2026-10-07',
  );
  assert.equal(
    normalizeInvoices([row], headers, '987654321')[0].documentUrl,
    row.links[0].url,
  );
});

test('canonicalizes zero and leading zeros while preserving credit notes', () => {
  for (const [input, expected] of [
    ['0,00 €', '0.00'],
    ['-0,00 €', '0.00'],
    ['0001,20 €', '1.20'],
    ['-0001,20 €', '-1.20'],
  ]) {
    const cells = [...row.cells];
    cells[4] = input;
    assert.equal(
      normalizeInvoices([{ ...row, cells }], headers, '987654321')[0].amount,
      expected,
    );
  }
});
test('requires explicit mapping for unknown columns and ambiguous links', () => {
  assert.throws(() => normalizeInvoices([row], ['campo1'], '987654321'));
  assert.throws(() =>
    normalizeInvoices(
      [{ ...row, links: [...row.links, { ...row.links[0], column: 4 }] }],
      headers,
      '987654321',
    ),
  );
  assert.equal(
    normalizeInvoices(
      [row],
      headers.map(() => 'campo'),
      '987654321',
      {
        issuerName: 0,
        issuerTaxId: 1,
        number: 2,
        date: 3,
        amount: 4,
        documentUrl: 2,
      },
    )[0].number,
    'FT/99',
  );
});

test('classifies extraction failures without including invoice contents', () => {
  assert.throws(() => normalizeInvoices([], ['private-header'], '987654321'), {
    code: 'INVOICE_COLUMN_UNKNOWN',
    field: 'issuerName',
    message: 'INVOICE_COLUMN_UNKNOWN',
  });
  const invalidDate = { ...row, cells: [...row.cells] };
  invalidDate.cells[3] = 'private-invalid-date';
  assert.throws(() => normalizeInvoices([invalidDate], headers, '987654321'), {
    code: 'INVOICE_DATE_INVALID',
    field: 'date',
    message: 'INVOICE_DATE_INVALID',
  });
  const invalidAmount = { ...row, cells: [...row.cells] };
  invalidAmount.cells[4] = 'private-invalid-amount';
  assert.throws(
    () => normalizeInvoices([invalidAmount], headers, '987654321'),
    {
      code: 'INVOICE_AMOUNT_INVALID',
      field: 'amount',
      message: 'INVOICE_AMOUNT_INVALID',
    },
  );
});

test('reads current portal columns with combined issuer and invoice/ATCUD', () => {
  const portalHeaders = [
    'Setor',
    'Emitente',
    'Nº Fatura / ATCUD',
    'Tipo',
    'Data Emissão',
    'Total',
    'IVA',
    'Base Tributável',
    'Situação',
    'Comunicação Emitente',
    'Comunicação Adquirente',
  ];
  const portalRow = {
    cells: [
      'Outros',
      '123456789 - Fornecedor - Exemplo, S.A.',
      'FT TEST/1032 / ABCD1234-1032',
      'Fatura',
      '2026-09-15',
      '300,00 €',
      '56,10 €',
      '243,90 €',
      'Pendente',
      '',
      '',
    ],
    links: [
      {
        column: 2,
        url: 'https://faturas.portaldasfinancas.gov.pt/detalheDocumentoAdquirente.action?idDocumento=1&dataEmissaoDocumento=2026-09-15',
      },
    ],
  };
  const original = JSON.stringify(portalRow);
  const [invoice] = normalizeInvoices([portalRow], portalHeaders, '987654321');
  assert.equal(invoice.issuerTaxId, '123456789');
  assert.equal(invoice.issuerName, 'Fornecedor - Exemplo, S.A.');
  assert.equal(invoice.number, 'FT TEST/1032');
  assert.equal(invoice.date, '2026-09-15');
  assert.equal(invoice.amount, '300.00');
  assert.equal(invoice.documentUrl, portalRow.links[0].url);
  assert.equal(JSON.stringify(portalRow), original);
  assert.deepEqual(normalizeInvoices([], portalHeaders, '987654321'), []);
  assert.throws(
    () =>
      normalizeInvoices(
        [
          {
            ...portalRow,
            cells: portalRow.cells.map((value, index) =>
              index === 1 ? 'Fornecedor sem NIF' : value,
            ),
          },
        ],
        portalHeaders,
        '987654321',
      ),
    { code: 'INVOICE_IDENTITY_INVALID' },
  );
});
test('rejects invalid periods before launching the browser', () => {
  for (const period of [
    {},
    { start: '2026-02-30', end: '2026-10-07' },
    { start: '2026-10-07', end: '2026-08-01' },
  ])
    assert.throws(() => validatePeriod(period));
});
test('sets both provided portal filters before submitting and waiting', async () => {
  const calls = [];
  const period = { start: '2026-08-01', end: '2026-10-07' };
  const page = {
    waitForSelector: async (selector) => calls.push(selector),
    waitForFunction: async () => {},
    evaluate: async (_fn, value) => {
      calls.push(value);
      return false;
    },
    click: async (selector) => calls.push(selector),
    waitForNetworkIdle: async () => calls.push('idle'),
  };
  await applyDateFilters(page, period, '#search');
  assert.deepEqual(calls, [
    '#dataInicioFilter',
    '#dataFimFilter',
    period,
    '#search',
    '#search',
    'idle',
  ]);
});

test('fails without a filter submit button instead of waiting for terminal input', async () => {
  const page = {
    waitForSelector: async () => {},
    waitForFunction: async () => {},
    evaluate: async () => false,
    waitForNetworkIdle: async () => assert.fail('must stop before extracting'),
  };
  await assert.rejects(
    applyDateFilters(page, { start: '2026-08-01', end: '2026-10-07' }),
    /aplicar automaticamente os filtros/,
  );
});

test('applies filters through a visible search button outside a form', async () => {
  const previousDocument = global.document;
  const period = { start: '2026-08-01', end: '2026-10-07' };
  let clicks = 0;
  const inputs = Object.fromEntries(
    ['dataInicioFilter', 'dataFimFilter'].map((id) => [
      id,
      { value: '', dispatchEvent() {}, closest: () => null },
    ]),
  );
  const button = {
    textContent: 'Pesquisar',
    disabled: false,
    getClientRects: () => [{}],
    click: () => clicks++,
  };
  global.document = {
    getElementById: (id) => inputs[id],
    querySelector: () => null,
    querySelectorAll: () => [button],
  };
  try {
    await applyDateFilters(
      {
        waitForSelector: async () => {},
        waitForFunction: async () => {},
        evaluate: async (fn, value) => fn(value),
        waitForNetworkIdle: async () => {},
      },
      period,
    );
    assert.equal(clicks, 1);
    assert.equal(inputs.dataInicioFilter.value, period.start);
    assert.equal(inputs.dataFimFilter.value, period.end);
    global.document.querySelectorAll = () => [button, { ...button }];
    await assert.rejects(
      applyDateFilters(
        {
          waitForSelector: async () => {},
          waitForFunction: async () => {},
          evaluate: async (fn, value) => fn(value),
        },
        period,
      ),
      { code: 'FILTER_SUBMIT_NOT_FOUND' },
    );
    assert.equal(clicks, 1);
  } finally {
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});
