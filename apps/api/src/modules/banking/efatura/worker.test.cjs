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
} = {}) {
  const messages = [];
  const page = {
    goto: async () => {},
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
                applyDateFilters: async () => ({ empty }),
              }
            : require(name),
    },
  );
  return { messages, exitCode: processMock.exitCode };
}

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
