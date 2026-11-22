const test = require('node:test'), assert = require('node:assert/strict');
const { compareVersions, findUpdate, fetchUpdate, createUpdateChecker } = require('./update-checker.cjs');
function release(version, overrides = {}) {
  const tag = `ponte-traducao-v${version}`;
  return { tag_name: tag, draft: false, prerelease: false, assets: [{ name: 'Ponte-Traducao-Windows.zip', state: 'uploaded', size: 100, browser_download_url: `https://github.com/pauloeduardorocha/Ponte/releases/download/${tag}/Ponte-Traducao-Windows.zip` }], ...overrides };
}
function harness(releases, options = {}) {
  const shown = [], opened = [], calls = [];
  const win = { isDestroyed: () => Boolean(options.destroyed) };
  const check = createUpdateChecker({ version: '0.3.2', getWindow: () => win,
    dialog: { showMessageBox: async (_, value) => { shown.push(value); return { response: options.response ?? 0 }; } },
    shell: { openExternal: async url => { opened.push(url); } },
    fetchImpl: async (url, init) => { calls.push({ url, init }); if (options.error) throw Error('offline'); return { ok: true, json: async () => releases }; },
  });
  return { check, shown, opened, calls };
}
test('versions compare numerically and reject malformed versions', () => {
  assert.equal(compareVersions('0.10.0', '0.9.99'), 1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareVersions('0.3.2', '0.3.2'), 0);
  for (const bad of ['v1.0.0', '1.2', '01.2.3', '1.2.3-beta', '9007199254740992.0.0']) assert.throws(() => compareVersions(bad, '1.0.0'));
});
test('only newer complete stable translation releases count, regardless of ordering', () => {
  const candidates = [release('0.10.0'), release('1.0.0', { draft: true }), release('2.0.0', { prerelease: true }), release('9.0.0', { assets: [] }), release('0.4.0'), release('0.3.2'), release('0.3.1'), release('5.0.0', { tag_name: 'v5.0.0' })];
  assert.equal(findUpdate(candidates, '0.3.2').version, '0.10.0');
  assert.equal(findUpdate([release('0.3.2'), release('0.3.1')], '0.3.2'), null);
  assert.throws(() => findUpdate({}, '0.3.2'));
});
test('untrusted download URLs, incomplete uploads and empty assets are ignored', () => {
  for (const url of ['file:///C:/Windows/test.exe', 'https://evil.example/setup.zip', 'https://github.com/other/repo/releases/download/v1/file.zip', 'javascript:alert(1)']) {
    const r = release('0.4.0'); r.assets[0].browser_download_url = url;
    assert.equal(findUpdate([r], '0.3.2'), null);
  }
  for (const changes of [{ state: 'new' }, { size: 0 }]) { const r = release('0.4.0'); Object.assign(r.assets[0], changes); assert.equal(findUpdate([r], '0.3.2'), null); }
});
test('startup checks once and opens the exact release download only when selected', async () => {
  const h = harness([release('0.4.0')]);
  const one = h.check(); assert.equal(h.check(), one); await one;
  assert.equal(h.calls.length, 1); assert.equal(h.shown.length, 1);
  assert.match(h.shown[0].detail, /Instalar.cmd/);
  assert.deepEqual(h.opened, ['https://github.com/pauloeduardorocha/Ponte/releases/download/ponte-traducao-v0.4.0/Ponte-Traducao-Windows.zip']);
  assert.equal(h.calls[0].init.redirect, 'error'); assert.ok(h.calls[0].init.signal);
  const deferred = harness([release('0.4.0')], { response: 1 }); await deferred.check(); assert.equal(deferred.opened.length, 0);
});
test('offline and current startup checks stay quiet; manual checks explain the result and retry', async () => {
  for (const options of [{}, { error: true }]) {
    const h = harness([release('0.3.2')], options); await h.check(); assert.equal(h.shown.length, 0);
    await h.check({ manual: true }); assert.equal(h.calls.length, 2); assert.equal(h.shown.length, 1);
    assert.match(h.shown[0].message, options.error ? /Não foi possível/ : /0.3.2/);
  }
  const closed = harness([release('0.4.0')], { destroyed: true }); await closed.check(); assert.equal(closed.shown.length, 0);
});
test('HTTP failures and malformed responses reject rather than pretending to be up to date', async () => {
  await assert.rejects(fetchUpdate('0.3.2', async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(fetchUpdate('0.3.2', async () => ({ ok: true, json: async () => ({}) })), /inválida/);
});
test('pagination finds releases beyond the first page', async () => {
  const urls = [];
  const update = await fetchUpdate('0.3.2', async url => { urls.push(url); return { ok: true, json: async () => urls.length === 1 ? Array.from({ length: 100 }, () => ({ tag_name: 'web-release' })) : [release('0.4.0')] }; });
  assert.equal(update.version, '0.4.0'); assert.match(urls[1], /page=2$/);
});
const vm = require('node:vm'), fs = require('node:fs');
test('desktop startup triggers a non-blocking check and exposes a manual menu action', async () => {
  let ready, menu, options, loaded = false;
  const checks = [], windows = [], pending = new Promise(() => {});
  let suspended = false;
  const powerMonitor = new (require("node:events").EventEmitter)();
  class Window {
    constructor(settings) { options = settings; windows.push(this); this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    async loadURL() { loaded = true; }
    on() {}
    close() { suspended = true; }
  }
  const electron = { powerMonitor, app: { getPath: () => __dirname, whenReady: () => ({ then: callback => { ready = callback; } }), on() {} }, BrowserWindow: Window,
    session: { defaultSession: { setPermissionRequestHandler() {} } }, dialog: {}, shell: {},
    Menu: { buildFromTemplate: template => template, setApplicationMenu: value => { menu = value; } },
  };
  vm.runInNewContext(fs.readFileSync(__dirname + '/main.cjs', 'utf8'), {
    __dirname, require: name => {
      if (name === 'electron') return electron;
      if (name === './diagnostics.cjs') return { createDiagnostics: () => () => {} };
      if (name === './server.cjs') return { createTranslationServer: () => ({ listen: async () => ({ presenterUrl: 'http://localhost:3210/presenter#test' }) }) };
      if (name === './update-checker.cjs') return { createUpdateChecker: config => { assert.equal(config.version, require('./package.json').version); return settings => { checks.push(settings); return pending; }; } };
      return require(name);
    },
  });
  await ready();
  assert.equal(loaded, true); assert.equal(windows.length, 1); assert.ok(options.title.endsWith(require('./package.json').version));
  assert.ok(options.icon.endsWith(process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'));
  assert.equal(checks.length, 1, 'startup checks once without waiting for the network');
  menu.find(item => item.label === 'Ajuda').submenu[0].click();
  assert.equal(checks[1].manual, true);
  powerMonitor.emit("suspend");
  assert.equal(suspended, true);
});
