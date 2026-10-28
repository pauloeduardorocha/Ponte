const { existsSync } = require('node:fs');
const puppeteer = require('puppeteer-core').default;
const { createInterface } = require('node:readline');
const {
  validatePeriod,
  applyDateFilters,
  watchPortalResponses,
} = require('../src/modules/banking/efatura/filters.cjs');
const {
  inspectDateFilters,
  requestDates,
} = require('../src/modules/banking/efatura/filter-diagnostics.cjs');

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value];
    }),
  );
  const period = validatePeriod({ start: args.start, end: args.end });
  const executablePath = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((path) => path && existsSync(path));
  if (!executablePath)
    throw Object.assign(new Error(), { code: 'LOCAL_BROWSER_NOT_FOUND' });
  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    defaultViewport: null,
  });
  const page = await browser.newPage();
  const portalResponses = watchPortalResponses(page);
  const log = (event, details = {}) =>
    console.log(JSON.stringify({ event, ...details }));
  try {
    log('manual_login_required', { period });
    await page.goto(
      'https://www.acesso.gov.pt/jsp/loginRedirectForm.jsp?path=consultarDocumentosAdquirente.action&partID=EFPF',
      { waitUntil: 'networkidle2' },
    );
    await page.waitForFunction(
      () => location.hostname === 'faturas.portaldasfinancas.gov.pt',
      { timeout: 600000 },
    );
    await page.goto(
      'https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action',
      { waitUntil: 'networkidle2' },
    );
    await page.waitForSelector('#dataInicioFilter', { visible: true });
    log('before_filters', await inspectDateFilters(page, period));
    page.on('request', (request) => {
      const dates = requestDates(request);
      if (dates) log('filter_request_dates', { dates });
    });
    page.on('response', (response) => {
      if (requestDates(response.request()))
        log('filter_response', { status: response.status() });
    });
    page.on('requestfailed', (request) => {
      if (requestDates(request)) log('filter_request_failed');
    });
    try {
      await applyDateFilters(
        page,
        period,
        process.env.EFATURA_FILTER_SUBMIT,
        portalResponses,
      );
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      log('filter_wait_timeout');
    }
    let pageNumber = 1;
    while (true) {
      const report = await inspectDateFilters(page, period);
      log('after_filters', { pageNumber, ...report });
      if (!report.hasNext || pageNumber >= 1000) break;
      const previous = await page.evaluateHandle(() => {
        const table = document.querySelector('table#documentos');
        const jquery = window.jQuery;
        const settings =
          jquery?.fn?.dataTableSettings || jquery?.fn?.dataTable?.settings;
        const config =
          settings &&
          Array.from(settings).find((item) => item.nTable === table);
        const state = {
          config,
          start: config?._iDisplayStart,
          first: table.querySelector('tbody tr'),
          text: table.querySelector('tbody').innerText,
          redrawn: false,
        };
        if (config)
          jquery(table).on('draw.dt.ponteLocal draw.ponteLocal', () => {
            state.redrawn = true;
          });
        return state;
      });
      try {
        const advanced = await page.evaluate((previous) => {
          const config = previous.config;
          if (typeof config?.oInstance?.fnPageChange === 'function') {
            config.oInstance.fnPageChange('next');
            return true;
          }
          if (config && typeof window.jQuery?.fn?.DataTable === 'function') {
            window.jQuery(config.nTable).DataTable().page('next').draw('page');
            return true;
          }
          return false;
        }, previous);
        if (!advanced)
          await page.click('#documentos_paginate li.next:not(.disabled) a');
        await page.waitForFunction(
          (previous) =>
            previous.config
              ? previous.redrawn &&
                previous.config._iDisplayStart !== previous.start
              : !previous.first.isConnected ||
                document.querySelector('table#documentos tbody').innerText !==
                  previous.text,
          {},
          previous,
        );
      } finally {
        try {
          await page.evaluate(() => {
            window.jQuery?.('table#documentos').off('.ponteLocal');
          });
        } finally {
          await previous.dispose();
        }
      }
      pageNumber++;
    }
    log('diagnostic_complete');
  } catch (error) {
    log('diagnostic_failed', {
      code: [
        'FILTER_SUBMIT_NOT_FOUND',
        'PORTAL_RATE_LIMITED',
        'PORTAL_HTTP_ERROR',
      ].includes(error.code)
        ? error.code
        : 'LOCAL_DIAGNOSTIC_FAILED',
      timeout: error.name === 'TimeoutError',
    });
    process.exitCode = 1;
  }
  // Keep the authenticated browser and allow another snapshot without a new login.
  if (browser.connected) {
    log('local_controls_ready', { commands: ['inspect', 'apply', 'close'] });
    const input = createInterface({ input: process.stdin });
    input.on('line', async (command) => {
      try {
        if (command.trim() === 'close') await browser.close();
        if (command.trim() === 'apply')
          await applyDateFilters(
            page,
            period,
            process.env.EFATURA_FILTER_SUBMIT,
            portalResponses,
          );
        if (['inspect', 'apply'].includes(command.trim()))
          log('manual_snapshot', await inspectDateFilters(page, period));
      } catch (error) {
        log('local_control_failed', {
          timeout: error.name === 'TimeoutError',
          code: ['PORTAL_RATE_LIMITED', 'PORTAL_HTTP_ERROR'].includes(
            error.code,
          )
            ? error.code
            : 'LOCAL_DIAGNOSTIC_FAILED',
        });
      }
    });
    await new Promise((resolve) => browser.once('disconnected', resolve));
    input.close();
  }
  portalResponses.dispose();
}

main().catch(() => {
  console.error(
    'Não foi possível iniciar. Use --start=YYYY-MM-DD --end=YYYY-MM-DD e configure PUPPETEER_EXECUTABLE_PATH se necessário.',
  );
  process.exitCode = 1;
});
