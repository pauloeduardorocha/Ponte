// Run against a built package. All installation writes stay in a temporary user folder.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
async function main() {
  const source = path.resolve(process.argv[2] || '');
  assert.ok(fs.existsSync(path.join(source, 'Instalar.cmd')), 'provide the built package folder');
  for (const name of ['Instalar.cmd', 'install-windows.ps1']) {
    const bytes = fs.readFileSync(path.join(source, name));
    assert.ok(!bytes.toString('utf8').replace(/\r\n/g, '').includes('\n'), name + ' requires CRLF');
    assert.equal(bytes.subarray(0, 3).toString('hex') === 'efbbbf', name.endsWith('.ps1'), name + ' encoding');
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-package-install-'));
  let running;
  try {
    const local = path.join(temp, 'LocalAppData'), target = path.join(local, 'Ponte-Traducao');
    const install = () => spawnSync('cmd.exe', ['/d', '/s', '/c', '""' + path.join(source, 'Instalar.cmd') + '" -NoLaunch -NoShortcuts"'], { windowsVerbatimArguments: true, input: '\r\n', cwd: path.join(process.env.WINDIR, 'System32'), env: { ...process.env, LOCALAPPDATA: local }, encoding: 'utf8', windowsHide: true, timeout: 45000 });
    let r = install(); assert.equal(r.status, 0, r.stdout + r.stderr);
    const packageFile = path.join(target, 'resources', 'app', 'package.json');
    const expected = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
    fs.writeFileSync(packageFile, JSON.stringify({ name: 'ponte-traducao', version: '0.3.1' }));
    fs.writeFileSync(path.join(target, 'old-runtime-file.txt'), 'old version');
    r = install(); assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(fs.readFileSync(packageFile, 'utf8')).version, expected);
    assert.equal(fs.existsSync(path.join(target, 'old-runtime-file.txt')), false);
    assert.ok(fs.existsSync(path.join(target, 'resources', 'app', 'update-checker.cjs')));
    running = spawn(path.join(target, 'Ponte-Traducao.exe'), ['-e', "console.log(typeof require('./resources/app/update-checker.cjs').createUpdateChecker);setInterval(()=>{},1000)"], { cwd: target, env: { ...process.env, LOCALAPPDATA: local, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('packaged runtime did not start')), 10000);
      running.once('error', reject);
      running.stdout.on('data', bytes => { if (bytes.toString().includes('function')) { clearTimeout(timeout); resolve(); } });
      running.once('exit', code => { clearTimeout(timeout); reject(Error('runtime exited: ' + code)); });
    });
    r = install(); assert.notEqual(r.status, 0); assert.match(r.stdout, /Feche o aplicativo/);
    assert.equal(JSON.parse(fs.readFileSync(packageFile, 'utf8')).version, expected);
    assert.deepEqual(fs.readdirSync(local), ['Ponte-Traducao']);
    console.log('PASS: real packaged runtime installs, upgrades in place, loads updater, and refuses replacement while running. No real user shortcuts or installation changed.');
  } finally {
    if (running && running.exitCode === null) { const exited = new Promise(resolve => running.once('exit', resolve)); running.kill(); await exited; }
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('ponte-package-install-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
