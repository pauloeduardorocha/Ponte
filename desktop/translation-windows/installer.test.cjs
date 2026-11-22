const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const installer = path.join(__dirname, 'install-windows.ps1');
const { writeWindowsScript } = require('./windows-script.cjs');
test('CMD launcher runs from another working directory, handles spaces and preserves success/failure', { skip: process.platform !== 'win32', timeout: 30000 }, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-cmd-launcher-'));
  t.after(() => {
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('ponte-cmd-launcher-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const source = path.join(temp, 'pacote com espaços & teste');
  fs.mkdirSync(source);
  const batch = path.join(source, 'Instalar.cmd'), marker = path.join(temp, 'invoked.txt');
  const checkoutScript = path.join(temp, 'checkout.cmd');
  fs.writeFileSync(checkoutScript, fs.readFileSync(path.join(__dirname, 'Instalar.cmd'), 'utf8').replace(/\r\n/g, '\n'));
  writeWindowsScript(checkoutScript, batch);
  const script = fs.readFileSync(batch);
  assert.ok(!script.toString('utf8').replace(/\r\n/g, '').includes('\n'), 'packaged CMD must use CRLF');
  assert.notEqual(script.subarray(0, 3).toString('hex'), 'efbbbf', 'CMD must not start with a UTF-8 BOM');
  fs.writeFileSync(batch, script);
  fs.writeFileSync(path.join(source, 'install-windows.ps1'), 'param([switch]$NoLaunch, [switch]$NoShortcuts)\r\nif (-not $NoLaunch -or -not $NoShortcuts) { exit 99 }\r\nSet-Content -LiteralPath $env:PONTE_INSTALLER_MARKER -Value $PSScriptRoot -Encoding UTF8\r\nexit ([int]$env:PONTE_INSTALLER_EXIT)\r\n');
  for (const exitCode of [0, 23]) {
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', '""' + batch + '" -NoLaunch -NoShortcuts"'], {
      windowsVerbatimArguments: true, windowsHide: true, encoding: 'utf8', input: '\r\n', timeout: 10000,
      cwd: path.join(process.env.WINDIR, 'System32'),
      env: { ...process.env, PONTE_INSTALLER_MARKER: marker, PONTE_INSTALLER_EXIT: String(exitCode) },
    });
    assert.equal(result.status, exitCode === 0 ? 0 : 1, result.stdout + result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(fs.readFileSync(marker, 'utf8').trim(), source);
    if (exitCode) assert.match(result.stdout, /instalação não foi concluída/);
  }
});
test('Windows installer replaces the same installation, removes stale runtime files, and refuses downgrade or unrelated folders', { skip: process.platform !== 'win32', timeout: 45000 }, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-installer-test-'));
  t.after(() => { const resolved = path.resolve(temp); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('ponte-installer-test-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const source = path.join(temp, 'extracted'), local = path.join(temp, 'local-app-data'), target = path.join(local, 'Ponte-Traducao');
  const metadata = path.join(source, 'resources', 'app', 'package.json');
  fs.mkdirSync(path.dirname(metadata), { recursive: true });
  const prepare = version => { fs.writeFileSync(metadata, JSON.stringify({ name: 'ponte-traducao', version })); fs.writeFileSync(path.join(source, 'Ponte-Traducao.exe'), 'synthetic-runtime-' + version); };
  const install = () => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer, '-SourceDirectory', source, '-NoLaunch', '-NoShortcuts'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, LOCALAPPDATA: local }, timeout: 15000 });
  prepare('0.3.1'); let result = install(); assert.equal(result.status, 0, result.stdout + result.stderr);
  fs.writeFileSync(path.join(target, 'old-runtime.dll'), 'old');
  prepare('0.3.2'); result = install(); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(target, 'Ponte-Traducao.exe'), 'utf8'), 'synthetic-runtime-0.3.2');
  assert.equal(fs.existsSync(path.join(target, 'old-runtime.dll')), false);
  assert.deepEqual(fs.readdirSync(local), ['Ponte-Traducao']);
  prepare('0.3.1'); result = install(); assert.notEqual(result.status, 0); assert.match(result.stdout, /recente/);
  fs.writeFileSync(path.join(target, 'resources', 'app', 'package.json'), JSON.stringify({ name: 'unrelated-app', version: '0.1.0' }));
  prepare('0.3.3'); result = install(); assert.notEqual(result.status, 0); assert.match(result.stdout, /outro aplicativo/);
  assert.equal(fs.readFileSync(path.join(target, 'Ponte-Traducao.exe'), 'utf8'), 'synthetic-runtime-0.3.2');
  assert.deepEqual(fs.readdirSync(local), ['Ponte-Traducao']);
});
