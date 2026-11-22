const { app, BrowserWindow } = require('electron');
const { WebSocket } = require('ws');
const { once } = require('node:events');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
app.whenReady().then(async () => {
  let server, window, presenter;
  const output = path.join(process.env.TEMP, 'ponte-radio-smoke.json');
  try {
    let bridge;
    class Bridge { constructor(emit) { this.emit = emit; bridge = this; } start() { this.emit({ ready: true }); } stop() {} audio() {} }
    server = require('./server.cjs').createTranslationServer({ port: 0, host: '127.0.0.1', Bridge });
    const info = await server.listen(), address = new URL(info.presenterUrl), base = `http://127.0.0.1:${address.port}`;
    presenter = new WebSocket(base.replace('http:', 'ws:') + '/presenter-ws', { origin: base });
    const auth = new Promise(resolve => presenter.on('message', raw => { if (JSON.parse(raw).authenticated) resolve(); }));
    const ready = new Promise(resolve => presenter.on('message', raw => { if (JSON.parse(raw).ready) resolve(); }));
    await once(presenter, 'open'); presenter.send(JSON.stringify({ token: address.hash.slice(1) })); await auth;
    presenter.send(JSON.stringify({ action: 'start', key: 'synthetic-key' })); await ready;
    const pcm = Buffer.alloc(48000); for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(10000*Math.sin(2*Math.PI*440*i/24000)), i*2);
    window = new BrowserWindow({ show: false, width: 850, height: 1000, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: true } });
    await window.loadURL(base + `/listen/${server.room}?mode=background`);
    await window.webContents.executeJavaScript("document.getElementById('radio').volume=0;document.getElementById('listen').click()", true);
    bridge.emit({ content: { modelTurn: { parts: [{ inlineData: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=24000' } }] } } });
    await new Promise(resolve => setTimeout(resolve, 9000));
    const initialTime = await window.webContents.executeJavaScript("document.getElementById('radio').currentTime");
    await new Promise(resolve => setTimeout(resolve, 3000));
    const result = await window.webContents.executeJavaScript("({time:document.getElementById('radio').currentTime,paused:document.getElementById('radio').paused,error:document.getElementById('radio').error?.message,src:document.getElementById('radio').currentSrc,mediaTitle:navigator.mediaSession?.metadata?.title})");
    assert.ok(result.time - initialTime > 2, JSON.stringify({ initialTime, ...result })); assert.equal(result.paused, false); assert.equal(result.error, undefined);
    fs.writeFileSync(output, JSON.stringify({ passed: true, initialTime, hiddenWindowNativePlayback: result }));
  } catch (error) { fs.writeFileSync(output, JSON.stringify({ error: error.stack })); }
  finally { if (window && !window.isDestroyed()) window.destroy(); presenter?.terminate(); if (server) await server.close(); app.quit(); }
});
