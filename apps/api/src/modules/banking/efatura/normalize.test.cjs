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
    evaluate: async (_fn, value) => calls.push(value),
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
    evaluate: async () => false,
    waitForNetworkIdle: async () => assert.fail('must stop before extracting'),
  };
  await assert.rejects(
    applyDateFilters(page, { start: '2026-08-01', end: '2026-10-07' }),
    /aplicar automaticamente os filtros/,
  );
});
