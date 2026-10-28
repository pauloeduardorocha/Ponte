const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  requestDates,
  inspectDateFilters,
} = require('./filter-diagnostics.cjs');
const { applyDateFilters, watchPortalResponses } = require('./filters.cjs');
const { EventEmitter } = require('node:events');
const { launchBrowser } = require('./browser.cjs');

test('retains an initial 429 until filters start, ignores unrelated hosts, and removes its listener', async () => {
  const page = Object.assign(new EventEmitter(), {
    waitForSelector: async () => {},
    waitForFunction: async () => {},
    evaluate: async () => {
      assert.fail('must not submit another search after an initial 429');
    },
  });
  const monitor = watchPortalResponses(page);
  page.emit('response', {
    url: () => 'https://unrelated.test/json/obterDocumentosAdquirente.action',
    status: () => 429,
  });
  page.emit('response', {
    url: () => 'https://faturas.portaldasfinancas.gov.pt/static/script.js',
    status: () => 429,
  });
  page.emit('response', {
    url: () =>
      'https://faturas.portaldasfinancas.gov.pt/json/obterDocumentosAdquirente.action?token=private-token',
    status: () => 429,
  });
  try {
    await assert.rejects(
      applyDateFilters(
        page,
        { start: '2026-10-12', end: '2026-10-27' },
        undefined,
        monitor,
      ),
      { code: 'PORTAL_RATE_LIMITED', message: 'PORTAL_RATE_LIMITED' },
    );
  } finally {
    monitor.dispose();
  }
  assert.equal(page.listenerCount('response'), 0);
});

test(
  'real browser stops on search HTTP errors without waiting for hidden panels or retrying',
  {
    skip:
      process.platform !== 'linux' && !process.env.PUPPETEER_EXECUTABLE_PATH,
    timeout: 30000,
  },
  async () => {
    const browser = await launchBrowser();
    try {
      for (const status of [429, 503]) {
        const page = await browser.newPage();
        let searches = 0;
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          searches++;
          void request.respond({
            status,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: '{"success":false,"message":"private-response"}',
          });
        });
        await page.setContent(`<input id="dataInicioFilter"><input id="dataFimFilter">
        <div class="searchResults">Old results</div><div class="noSearchResults hide"></div>
        <button id="search" onclick="document.querySelector('.searchResults').classList.add('hide'); fetch('https://faturas.portaldasfinancas.gov.pt/json/obterDocumentosAdquirente.action?dataInicioFilter=2026-10-12')">Pesquisar</button>`);
        await assert.rejects(
          applyDateFilters(
            page,
            { start: '2026-10-12', end: '2026-10-27' },
            '#search',
          ),
          {
            code: status === 429 ? 'PORTAL_RATE_LIMITED' : 'PORTAL_HTTP_ERROR',
            message:
              status === 429 ? 'PORTAL_RATE_LIMITED' : 'PORTAL_HTTP_ERROR',
          },
        );
        assert.equal(searches, 1);
        assert.equal(page.listenerCount('response'), 0);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  },
);

test(
  'waits for initial and filtered AJAX results rather than global network idle, including empty results',
  {
    skip:
      process.platform !== 'linux' && !process.env.PUPPETEER_EXECUTABLE_PATH,
    timeout: 30000,
  },
  async () => {
    const browser = await launchBrowser();
    try {
      for (const empty of [false, true]) {
        const page = await browser.newPage();
        await page.setContent(`<input id="dataInicioFilter" value="2026-08-01"><input id="dataFimFilter" value="2026-10-28">
        <button id="search">Pesquisar</button>
        <div class="searchResults hide"><table id="documentos"><tbody><tr><td>2026-08-01</td></tr></tbody></table></div>
        <div class="noSearchResults hide"></div>
        <script>
          const results = document.querySelector('.searchResults');
          const noResults = document.querySelector('.noSearchResults');
          setTimeout(() => {
            document.querySelector('#dataInicioFilter').value = '2026-08-01';
            results.classList.remove('hide');
          }, 200);
          document.querySelector('#search').onclick = () => {
            results.classList.add('hide'); noResults.classList.add('hide');
            setTimeout(() => {
              if (${empty}) noResults.classList.remove('hide');
              else {
                document.querySelector('td').innerText = '2026-10-15';
                results.classList.remove('hide');
              }
            }, 300);
          };
        </script>`);
        page.waitForNetworkIdle = async () =>
          assert.fail(
            'unrelated traffic must not gate a completed portal search',
          );
        const result = await applyDateFilters(
          page,
          { start: '2026-10-12', end: '2026-10-27' },
          '#search',
        );
        assert.equal(result.empty, empty);
        if (empty) {
          const report = await inspectDateFilters(page, {
            start: '2026-10-12',
            end: '2026-10-27',
          });
          assert.equal(report.empty, true);
          assert.equal(report.rows, 0);
          assert.equal(report.hasNext, false);
        }
        assert.equal(
          await page.$eval('#dataInicioFilter', (input) => input.value),
          '2026-10-12',
        );
        if (!empty)
          assert.equal(
            await page.$eval('td', (cell) => cell.innerText),
            '2026-10-15',
          );
        await page.close();
      }
    } finally {
      await browser.close();
    }
  },
);

test('request diagnostics retain only recognized dates, never credentials or session URLs', () => {
  assert.deepEqual(
    requestDates({
      url: () =>
        'https://example.test/?dataInicioFilter=2026-10-12&token=private-token&nif=123456789',
      postData: () => 'dataFimFilter=2026-10-27&password=private-password',
    }),
    { dataInicioFilter: '2026-10-12', dataFimFilter: '2026-10-27' },
  );
  assert.deepEqual(
    requestDates({
      url: () => 'https://example.test/?dataInicio=private-password',
      postData: () => '',
    }),
    { dataInicio: 'INVALID_DATE' },
  );
  assert.equal(
    requestDates({
      url: () => 'https://example.test/?token=private-token',
      postData: () => '',
    }),
    null,
  );
});

test(
  'real browser diagnostics distinguish accepted inputs from unfiltered results and inspect the next page',
  {
    skip:
      process.platform !== 'linux' && !process.env.PUPPETEER_EXECUTABLE_PATH,
    timeout: 30000,
  },
  async () => {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(`<input id="dataInicioFilter" type="date"><input id="dataFimFilter" type="date">
      <input name="password" value="private-password">
      <button id="search">Pesquisar</button>
      <table id="documentos"><thead><tr><th>Emitente</th><th>Data Emissão</th><th>Total</th></tr></thead>
      <tbody><tr><td>private-issuer</td><td>2026-10-01</td><td>private-amount</td></tr></tbody></table>
      <ul id="documentos_paginate"><li class="next"><a href="#">Next</a></li></ul>`);
      const period = { start: '2026-10-12', end: '2026-10-27' };
      await applyDateFilters(page, period, '#search');
      const ignoredFilter = await inspectDateFilters(page, period);
      assert.equal(ignoredFilter.inputs[0].date, period.start);
      assert.equal(ignoredFilter.inputs[1].date, period.end);
      assert.equal(ignoredFilter.outsidePeriod, 1);
      assert.equal(ignoredFilter.hasNext, true);
      await page.evaluate(() => {
        document.querySelector('#search').onclick = () => {
          document.querySelector(
            '#documentos tbody tr td:nth-child(2)',
          ).innerText = '15/10/2026';
        };
      });
      await applyDateFilters(page, period, '#search');
      const applied = await inspectDateFilters(page, period);
      assert.equal(applied.outsidePeriod, 0);
      assert.equal(applied.earliest, '2026-10-15');
      await page.evaluate(() => {
        document.querySelector(
          '#documentos tbody tr td:nth-child(2)',
        ).innerText = '2026-10-28';
      });
      const nextPage = await inspectDateFilters(page, period);
      assert.equal(nextPage.outsidePeriod, 1);
      assert.equal(nextPage.inputs[0].date, period.start);
      assert.doesNotMatch(
        JSON.stringify({ ignoredFilter, applied, nextPage }),
        /private-|password|amount|issuer/,
      );
    } finally {
      await browser.close();
    }
  },
);
