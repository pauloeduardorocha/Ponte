const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { WebSocket } = require('ws');
const { RadioStream } = require('./radio-stream.cjs');
const { createTranslationServer } = require('./server.cjs');
class Response extends EventEmitter {
  constructor() { super(); this.chunks = []; this.writableLength = 0; this.destroyed = false; }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  flushHeaders() {}
  write(bytes) { this.chunks.push(Buffer.from(bytes)); }
  end() { this.ended = true; this.emit('close'); }
  destroy() { this.destroyed = true; this.emit('close'); }
}
test('native MP3 is encoded once, shared, and continues through pauses in speech', t => {
  const radio = new RadioStream(); t.after(() => radio.stop());
  const first = new Response(), second = new Response(); radio.subscribe(first); radio.subscribe(second);
  const pcm = Buffer.alloc(48000);
  for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * 440 * i / 24000)), i * 2);
  radio.enqueue(pcm, 24000);
  for (let i = 0; i < 50; i++) radio.pulse();
  const one = Buffer.concat(first.chunks), two = Buffer.concat(second.chunks);
  assert.deepEqual(one, two); assert.equal(first.headers['Content-Type'], 'audio/mpeg');
  assert.equal(one[0], 255); assert.equal(one[1] & 224, 224);
  assert.ok(one.length > 10000 && one.length < 14000, `2 seconds at 48 kbit/s: ${one.length} bytes`);
  assert.equal(radio.queued, 0);
  const before = one.length; for (let i = 0; i < 10; i++) radio.pulse();
  assert.ok(Buffer.concat(first.chunks).length > before, 'silence keeps the native media stream alive');
  radio.stop(); assert.equal(first.ended, true); assert.equal(second.ended, true); assert.equal(radio.listenerCount, 0);
});
test('HTTP radio runs without an audience WebSocket and stops with the presenter', { timeout: 10000 }, async t => {
  class Bridge { constructor(emit) { this.emit = emit; } start() { this.emit({ ready: true }); } stop() {} audio() {} }
  const server = createTranslationServer({ port: 0, host: '127.0.0.1', Bridge }); t.after(() => server.close());
  const info = await server.listen(), address = new URL(info.presenterUrl), base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(base + `/audio/${server.room}.mp3`)).status, 503);
  const page = await (await fetch(base + `/listen/${server.room}?mode=background`)).text();
  assert.match(page, /<audio /); assert.doesNotMatch(page, /id="listen"/);
  assert.match(page, /Texto da tradução/);
  assert.equal(await (await fetch(base + `/listen/${server.room}`)).text(), page, 'legacy background and default links serve the same audio and transcript player');
  const presenter = new WebSocket(base.replace('http:', 'ws:') + '/presenter-ws', { origin: base });
  const ready = new Promise(resolve => presenter.on('message', raw => { if (JSON.parse(raw).ready) resolve(); }));
  const auth = new Promise(resolve => presenter.on('message', raw => { if (JSON.parse(raw).authenticated) resolve(); }));
  await once(presenter, 'open'); presenter.send(JSON.stringify({ token: address.hash.slice(1) })); await auth;
  presenter.send(JSON.stringify({ action: 'start', key: 'fake' })); await ready;
  const stream = await fetch(base + `/audio/${server.room}.mp3`, { signal: AbortSignal.timeout(8000) });
  assert.equal(stream.headers.get('content-type'), 'audio/mpeg');
  const reader = stream.body.getReader(), first = await reader.read();
  assert.ok(first.value.length); assert.equal(first.value[0], 255);
  presenter.send(JSON.stringify({ action: 'stop' }));
  while (!(await reader.read()).done) { /* drain finite buffered bytes */ }
  presenter.close();
});
