const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { launchBrowser } = require('./browser.cjs');

test('launches the configured system browser without downloading Chromium', async () => {
  const previousPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const previousSandbox = process.env.EFATURA_CHROMIUM_NO_SANDBOX;
  const browser = {};
  const launch = mock.method(puppeteer.default, 'launch', async () => browser);
  try {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/installed/chromium';
    process.env.EFATURA_CHROMIUM_NO_SANDBOX = 'true';
    assert.equal(await launchBrowser(), browser);
    assert.deepEqual(launch.mock.calls[0].arguments[0], {
      executablePath: '/installed/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } finally {
    launch.mock.restore();
    if (previousPath === undefined)
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    else process.env.PUPPETEER_EXECUTABLE_PATH = previousPath;
    if (previousSandbox === undefined)
      delete process.env.EFATURA_CHROMIUM_NO_SANDBOX;
    else process.env.EFATURA_CHROMIUM_NO_SANDBOX = previousSandbox;
  }
});

test('bundled Chromium matches the Puppeteer supported major version', () => {
  const { readFileSync } = require('node:fs');
  const { resolve, dirname } = require('node:path');
  const manifest = JSON.parse(
    readFileSync(
      resolve(
        dirname(require.resolve('@sparticuz/chromium')),
        '../package.json',
      ),
    ),
  );
  assert.equal(
    puppeteer.PUPPETEER_REVISIONS.chrome.split('.')[0],
    manifest.version.split('.')[0],
  );
});
