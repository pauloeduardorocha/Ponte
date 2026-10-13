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

test('both Vercel configurations include the worker runtime dependency tree', () => {
  const { readFileSync, existsSync } = require('node:fs');
  const { resolve, join } = require('node:path');
  const { createRequire } = require('node:module');
  const apiRoot = resolve(__dirname, '../../../..');
  const repoRoot = resolve(apiRoot, '../..');
  require('node:child_process').execFileSync(process.execPath, [
    join(apiRoot, 'scripts/package-efatura.cjs'),
  ]);
  const runtime = join(apiRoot, 'dist/efatura-runtime');
  const packagedApi = join(runtime, 'apps/api');
  const configurations = [
    JSON.parse(readFileSync(join(repoRoot, 'vercel.json'))).services.api,
    JSON.parse(readFileSync(join(apiRoot, 'vercel.json'))),
  ];
  const visited = new Set();
  function visit(name, base) {
    const localRequire = createRequire(join(base, 'package.json'));
    const directory = localRequire.resolve
      .paths(name)
      .map((path) => join(path, name))
      .find((path) => existsSync(join(path, 'package.json')));
    assert.ok(directory, `Missing installed dependency: ${name}`);
    assert.ok(
      directory.startsWith(runtime),
      `Dependency escaped packaged runtime: ${name}`,
    );
    if (visited.has(directory)) return;
    visited.add(directory);
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json')));
    for (const dependency of Object.keys(manifest.dependencies || {})) {
      visit(dependency, directory);
    }
  }
  visit('puppeteer-core', packagedApi);
  visit('@sparticuz/chromium', packagedApi);
  const packagedRequire = createRequire(join(packagedApi, 'package.json'));
  packagedRequire('./src/modules/banking/efatura/browser.cjs');
  for (const configuration of configurations) {
    const include = configuration.functions['src/main.ts'].includeFiles;
    assert.equal(include, 'dist/efatura-runtime/**');
  }
});
