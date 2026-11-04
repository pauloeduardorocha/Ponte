const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

async function runWorker({
  mapping,
  date = '2026-10-01',
  repeat = false,
  readError,
  empty = false,
  filterError,
  landingUrl = 'https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action',
} = {}) {
  const messages = [];
  const navigations = [];
  const page = {
    goto: async (url) => {
      navigations.push(url);
    },
    url: () => landingUrl,
    waitForSelector: async () => {},
    click: async () => {},
    type: async () => {},
    waitForFunction: async () => {},
    waitForNetworkIdle: async () => {},
    $$eval: async () => ['Emitente', 'Documento', 'Data', 'Total'],
    evaluateHandle: async () => ({ dispose: async () => {} }),
    evaluate: async (fn) => {
      if (fn.toString().includes('const linhas =')) {
        if (readError) throw readError;
        return [
          { cells: ['123456789 - Teste', 'FT 1', date, '10,00'], links: [] },
        ];
      }
      if (fn.toString().includes('const proxima =')) return repeat;
      if (fn.toString().includes('const configuracao =')) return true;
    },
  };
  const browser = { newPage: async () => page, close: async () => {} };
  const processMock = {
    env: { EFATURA_COLUMNS: mapping },
    once: (event, callback) => {
      if (event === 'message')
        queueMicrotask(() =>
          callback({
            nif: '123456789',
            password: 'private-password',
            bankImportId: 'import',
            period: { start: '2026-10-01', end: '2026-10-31' },
          }),
        );
    },
    send: (message, callback) => {
      messages.push(message);
      callback?.();
    },
    disconnect: () => {},
  };
  await vm.runInNewContext(
    readFileSync(join(__dirname, 'worker.cjs'), 'utf8'),
    {
      process: processMock,
      require: (name) =>
        name === './browser.cjs'
          ? { launchBrowser: async () => browser }
          : name === './filters.cjs'
            ? {
                validatePeriod: (period) => period,
                applyDateFilters: async () => {
                  if (filterError) throw filterError;
                  return { empty };
                },
                watchPortalResponses: () => ({ dispose: () => {} }),
              }
            : require(name),
    },
  );
  return { messages, exitCode: processMock.exitCode, navigations };
}

test('worker reuses the consultation reached after login, including query parameters', async () => {
  for (const suffix of ['', '?periodo=2026#documentos']) {
    const { navigations, messages } = await runWorker({
      landingUrl: `https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action${suffix}`,
    });
    assert.equal(navigations.length, 1);
    assert.ok(navigations[0].startsWith('https://www.acesso.gov.pt/'));
    assert.ok(messages.some((message) => message.result));
  }
});

test('worker navigates to the consultation when login lands on another portal page', async () => {
  const { navigations, messages } = await runWorker({
    landingUrl:
      'https://faturas.portaldasfinancas.gov.pt/painelAdquirente.action',
  });
  assert.equal(navigations.length, 2);
  assert.equal(
    navigations[1],
    'https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action',
  );
  assert.ok(messages.some((message) => message.result));
});

test('worker distinguishes invalid mapping, out-of-period data and repeated pages', async () => {
  for (const [options, failureCode, operation] of [
    [
      { mapping: 'private-invalid-json' },
      'INVOICE_MAPPING_INVALID',
      'parse_mapping',
    ],
    [{ mapping: 'null' }, 'INVOICE_MAPPING_INVALID', 'parse_mapping'],
    [{ date: '2026-09-30' }, 'INVOICE_OUTSIDE_PERIOD', 'normalize_page'],
    [{ repeat: true }, 'INVOICE_PAGE_REPEATED', 'normalize_page'],
  ]) {
    const { messages, exitCode } = await runWorker(options);
    const error = messages.find((message) => message.error);
    assert.equal(error?.failureCode, failureCode);
    assert.equal(error?.operation, operation);
    assert.equal(exitCode, 1);
    assert.ok(!messages.some((message) => message.result));
    assert.doesNotMatch(JSON.stringify(messages), /private-|123456789|FT 1/);
  }
});

test('worker identifies the failing browser operation without forwarding its private error', async () => {
  const { messages } = await runWorker({
    readError: new Error('private-password invoice 123456789'),
  });
  const error = messages.find((message) => message.error);
  assert.equal(error?.failureCode, 'PORTAL_ERROR');
  assert.equal(error?.operation, 'read_rows');
  assert.doesNotMatch(JSON.stringify(messages), /private-|123456789/);
});

test('worker still returns valid invoices through IPC', async () => {
  const { messages, exitCode } = await runWorker();
  assert.equal(exitCode, undefined);
  assert.equal(
    messages.find((message) => message.result)?.result.invoices.length,
    1,
  );
  assert.ok(!messages.some((message) => message.error));
});

test('worker preserves safe portal HTTP failures and does not return invoices', async () => {
  for (const code of ['PORTAL_RATE_LIMITED', 'PORTAL_HTTP_ERROR']) {
    const { messages, exitCode } = await runWorker({
      filterError: Object.assign(new Error('private-response'), { code }),
    });
    assert.equal(exitCode, 1);
    assert.equal(messages.find((message) => message.error)?.failureCode, code);
    assert.ok(!messages.some((message) => message.result));
    assert.doesNotMatch(JSON.stringify(messages), /private-response/);
  }
});

test('worker returns no invoices when the portal hides stale rows after an empty search', async () => {
  const { messages, exitCode } = await runWorker({
    empty: true,
    date: '2026-08-01',
  });
  assert.equal(exitCode, undefined);
  const result = messages.find((message) => message.result)?.result;
  assert.equal(result.invoices.length, 0);
  assert.equal(result.rawRows.length, 0);
  assert.ok(!messages.some((message) => message.error));
});
