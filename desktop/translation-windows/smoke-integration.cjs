// Run with Electron after building Ponte's API and frontend. All accounts and API keys are synthetic.
const { app, BrowserWindow, session } = require('electron');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = __dirname, ponte = path.resolve(root, '..', 'Ponte');
const output = path.join(process.env.TEMP, 'ponte-full-translation-result.json');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  let local, web;
  const windows = [];
  try {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(true));
    let fake, inputBytes = 0, row = null;
    class Bridge {
      constructor(emit) { this.emit = emit; fake = this; }
      start() { this.emit({ ready: true }); }
      stop() {}
      audio(bytes) { inputBytes += bytes.length; }
    }
    const { LiveTranslationService } = require(path.join(ponte, 'apps/api/dist/modules/live-translation/live-translation.service.js'));
    const db = { liveTranslation: {
      findUnique: async () => row,
      upsert: async ({ create, update }) => { row = row ? { ...row, ...update } : create; return row; },
      updateMany: async ({ where, data }) => {
        if (!row || row.deviceTokenHash !== where.deviceTokenHash || (where.sessionId && row.sessionId !== where.sessionId)) return { count: 0 };
        if (where.OR && row.expiresAt > new Date() && row.sessionId !== where.OR[0].sessionId) return { count: 0 };
        row = { ...row, ...data }; return { count: 1 };
      }
    } };
    const service = new LiveTranslationService(db);
    local = require('./server.cjs').createTranslationServer({ port: 0, Bridge });
    const info = await local.listen();
    const user = { id: 'smoke-admin', name: 'Administrador de teste', email: 'test@example.invalid', status: 'ACTIVE', roles: ['ADMIN'], permissions: [], colorMode: 'light' };
    web = http.createServer(async (req, res) => {
      const route = new URL(req.url, 'http://localhost').pathname;
      let body = ''; for await (const chunk of req) body += chunk;
      const json = value => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
      try {
        if (route.startsWith('/_vercel/')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(''); return; }
        if (route === '/api/v1/auth/refresh') return json({ accessToken: 'smoke-only', user });
        if (route === '/api/v1/auth/me') return json(user);
        if (route === '/api/v1/health') return json({ status: 'ok' });
        if (route === '/api/v1/live-translation/status') return json(await service.status());
        if (route === '/api/v1/live-translation/credential') return json(await service.rotateCredential());
        if (route === '/api/v1/live-translation/download') return json({ url: 'https://downloads.example.invalid/ponte.zip', localAvailable: false });
        if (route === '/api/v1/live-translation/publish') return json(await service.publish(JSON.parse(body), req.headers.authorization));
        if (route === '/api/v1/live-translation/unpublish') return json(await service.unpublish(JSON.parse(body).sessionId, req.headers.authorization));
        if (route.startsWith('/api/')) return json({ items: [], total: 0 });
        const base = path.join(ponte, 'apps/web/dist');
        let file = path.resolve(base, '.' + decodeURIComponent(route));
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(base, 'index.html');
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res);
      } catch (error) { res.writeHead(error.getStatus?.() || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: error.message })); }
    });
    await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
    const origin = `http://localhost:${web.address().port}`, errors = [];
    function window() {
      const result = new BrowserWindow({ show: false, width: 1100, height: 1100, webPreferences: { sandbox: true, contextIsolation: true } }); windows.push(result);
      result.webContents.on('console-message', (_event, ...args) => { if (args.some(value => typeof value === 'string' && /Uncaught|Refused to/.test(value))) errors.push(args); });
      return result;
    }
    const admin = window(); await admin.loadURL(origin + '/translation-app'); await wait(1500);
    await admin.webContents.executeJavaScript("([...document.querySelectorAll('button')].find(b=>b.textContent==='Gerar ligação para o computador')).click()", true); await wait(300);
    const configuration = await admin.webContents.executeJavaScript("document.querySelector('input[type=password]').value");
    assert.ok(JSON.parse(configuration).token);
    const presenter = window(); await presenter.loadURL(info.presenterUrl); await wait(300);
    for (let i = 0; i < 30 && !(await presenter.webContents.executeJavaScript("!document.getElementById('connect-ponte').disabled")); i++) await wait(100);
    await presenter.webContents.executeJavaScript(`document.getElementById('ponte-config').value=${JSON.stringify(configuration)};document.getElementById('connect-ponte').click();`, true); await wait(200);
    const pairingState = await presenter.webContents.executeJavaScript("document.getElementById('publication-status').textContent");
    assert.match(pairingState, /Conectado ao Ponte/, 'Pairing: ' + pairingState);
    await presenter.webContents.executeJavaScript("(async()=>{const c=new AudioContext({sampleRate:16000}),o=c.createOscillator(),d=c.createMediaStreamDestination();o.frequency.value=220;o.connect(d);o.start();await c.resume();navigator.mediaDevices.getUserMedia=async()=>d.stream;document.getElementById('key').value='smoke-key';document.getElementById('start').click();})()", true); await wait(700);
    for (let i = 0; i < 30 && !(await presenter.webContents.executeJavaScript("!document.getElementById('publish').disabled")); i++) await wait(100);
    const readiness = await presenter.webContents.executeJavaScript("({ready:!document.getElementById('publish').disabled,status:document.getElementById('status').textContent,publication:document.getElementById('publication-status').textContent})");
    assert.ok(readiness.ready, 'Presenter readiness: ' + JSON.stringify(readiness));
    await presenter.webContents.executeJavaScript("document.getElementById('publish').click()", true); await wait(500);
    assert.equal((await service.status()).active, true);
    const audience = window(); await audience.loadURL(origin + '/live-translation'); await wait(1200);
    assert.ok(await audience.webContents.executeJavaScript("!!document.querySelector('a[href=\"/live-translation\"]')"), 'publication enables PWA menu');
    await audience.webContents.executeJavaScript("window.translationPlaybackCount=0;const originalStart=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.translationPlaybackCount++;return originalStart.apply(this,args);};([...document.querySelectorAll('button')].find(b=>b.textContent==='Conectar à tradução')).click()", true); await wait(1000);
    const pcm = Buffer.alloc(24000);
    for (let i = 0; i < 12000; i++) pcm.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / 24000)), i * 2);
    fake.emit({ content: { outputTranscription: { text: 'The message reaches everyone.' }, modelTurn: { parts: [{ inlineData: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' } }] }, turnComplete: true } }); await wait(300);
    const view = await audience.webContents.executeJavaScript("({text:document.querySelector('[role=log]')?.textContent,connected:[...document.querySelectorAll('button')].some(b=>b.textContent==='Conectado'),codec:typeof window.LocalAudioCodec?.decode,playbackCount:window.translationPlaybackCount})");
    assert.match(view.text, /The message reaches everyone/); assert.ok(view.connected); assert.equal(view.codec, 'function'); assert.ok(view.playbackCount > 0); assert.ok(inputBytes > 0); assert.equal(errors.length, 0, JSON.stringify(errors));
    fs.writeFileSync(path.join(process.env.TEMP, 'ponte-translation-pwa.png'), (await audience.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(process.env.TEMP, 'ponte-translation-presenter.png'), (await presenter.webContents.capturePage()).toPNG());
    await presenter.webContents.executeJavaScript("document.getElementById('stop').click()", true); await wait(400);
    assert.equal((await service.status()).active, false);
    fs.writeFileSync(output, JSON.stringify({ passed: true, pairing: true, publication: true, pwaMenu: true, compressedPlayback: view, inputBytes, withdrawal: true, errors }));
  } catch (error) { fs.writeFileSync(output, JSON.stringify({ error: error.stack })); }
  finally {
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    if (local) await local.close(); if (web) await new Promise(resolve => web.close(resolve)); app.quit();
  }
});
