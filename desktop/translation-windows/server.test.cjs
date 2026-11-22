const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createTranslationServer } = require('./server.cjs');
const codec = require('./audio-codec.js');

function inbox(socket) {
  const queue = [], waiters = [];
  socket.on('message', (data, binary) => { const message = binary ? { audio: new Uint8Array(data) } : JSON.parse(data); if (waiters.length) waiters.shift()(message); else queue.push(message); });
  return async function next(predicate = () => true) {
    while (true) {
      const message = queue.length ? queue.shift() : await new Promise(resolve => waiters.push(resolve));
      if (predicate(message)) return message;
    }
  };
}
test('presenter authentication, live fan-out, audio, snapshots, clearing and disconnect', { timeout: 10000 }, async t => {
  let bridge, starts = 0, input;
  class FakeBridge {
    constructor(emit) { this.emit = emit; bridge = this; }
    start(key) { starts++; assert.equal(key, 'private-api-key'); this.emit({ ready: true }); }
    stop() {}
    audio(bytes) { input = bytes; }
  }
  const instance = createTranslationServer({ port: 0, host: '127.0.0.1', Bridge: FakeBridge });
  t.after(() => instance.close());
  const info = await instance.listen(), url = new URL(info.presenterUrl);
  const base = `http://127.0.0.1:${url.port}`, origin = base;
  const connect = async pathname => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + pathname, { origin });
    const next = inbox(socket); await once(socket, 'open'); return { socket, next };
  };
  assert.equal((await fetch(base + '/presenter')).status, 200);
  const response = await fetch(base + `/listen/${instance.room}`);
  assert.match(response.headers.get('permissions-policy'), /microphone=\(\)/);
  assert.equal((await fetch(base + '/server.cjs')).status, 404);
  assert.equal((await fetch(base + '/toString')).status, 404);
  const bad = await connect('/presenter-ws');
  bad.socket.send(JSON.stringify({ token: 'incorrect' }));
  assert.equal((await once(bad.socket, 'close'))[0], 1008);
  const presenter = await connect('/presenter-ws');
  presenter.socket.send(JSON.stringify({ token: url.hash.slice(1) }));
  const auth = await presenter.next(message => message.authenticated);
  assert.ok(auth.links.every(link => !link.includes(url.hash.slice(1))));
  const first = await connect(`/audience-ws/${instance.room}`);
  assert.equal((await first.next()).state, 'idle');
  first.socket.send(JSON.stringify({ action: 'start', key: 'attacker-key' }));
  presenter.socket.send(JSON.stringify({ action: 'start', key: 'private-api-key' }));
  await presenter.next(message => message.ready);
  await first.next(message => message.ready);
  presenter.socket.send(Buffer.from([1, 2, 3, 4]));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual([...input], [1, 2, 3, 4]);
  const content = { outputTranscription: { text: 'Hello everyone' }, modelTurn: { parts: [{ inlineData: { data: 'AAAAAA==', mimeType: 'audio/pcm;rate=24000' } }] }, turnComplete: true };
  bridge.emit({ content });
  const publicContent = (await first.next(message => message.content)).content;
  assert.deepEqual(publicContent.outputTranscription, content.outputTranscription);
  assert.deepEqual(publicContent.modelTurn.parts, [], 'raw PCM never reaches the audience');
  const packet = (await first.next(message => message.audio)).audio;
  assert.equal(codec.decode(packet).samples.length, 2);
  assert.deepEqual((await presenter.next(message => message.content)).content, content, 'presenter retains the API audio for monitoring');
  const second = await connect(`/audience-ws/${instance.room}`);
  assert.equal((await second.next()).snapshot, 'Hello everyone\n\n');
  bridge.emit({ content: { outputTranscription: { text: 'Welcome' } } });
  assert.equal((await second.next(message => message.content)).content.outputTranscription.text, 'Welcome');
  assert.equal((await first.next(message => message.content)).content.outputTranscription.text, 'Welcome');
  bridge.emit({ content });
  const firstPacket = (await first.next(message => message.audio)).audio;
  const secondPacket = (await second.next(message => message.audio)).audio;
  assert.deepEqual(firstPacket, secondPacket, 'one compressed block is shared by all listeners');
  assert.deepEqual(codec.decode(secondPacket).samples, codec.decode(firstPacket).samples, 'late listeners decode independently');
  assert.equal(starts, 1, 'audience shares one API session and cannot start one');
  presenter.socket.send(JSON.stringify({ action: 'clear' }));
  assert.equal((await second.next(message => message.reset)).reset, true);
  bridge.emit({ error: 'private diagnostic' });
  const safe = await second.next(message => message.state === 'error');
  assert.equal(safe.error, undefined);
  presenter.socket.close(); await once(presenter.socket, 'close');
  assert.equal((await first.next(message => message.state === 'idle')).state, 'idle');
});

test('websocket rejects foreign origins', { timeout: 5000 }, async t => {
  const instance = createTranslationServer({ port: 0, host: '127.0.0.1' }); t.after(() => instance.close());
  const info = await instance.listen();
  const socket = new WebSocket(info.audienceLinks[0].replace('http:', 'ws:').replace('/listen/', '/audience-ws/'), { origin: 'https://other.example' });
  const [error] = await once(socket, 'error'); assert.match(error.message, /hang up/);
});
test('only a configured PWA origin can connect across origins, and only to the audience', { timeout: 5000 }, async t => {
  const instance = createTranslationServer({ port: 0, host: '127.0.0.1' }); t.after(() => instance.close());
  const info = await instance.listen(), url = new URL(info.presenterUrl), base = `ws://127.0.0.1:${url.port}`;
  const presenter = new WebSocket(base + '/presenter-ws', { origin: `http://127.0.0.1:${url.port}` }), messages = inbox(presenter);
  await once(presenter, 'open'); presenter.send(JSON.stringify({ token: url.hash.slice(1) })); await messages(message => message.authenticated);
  presenter.send(JSON.stringify({ action: 'configure-ponte', configuration: JSON.stringify({ apiUrl: 'https://api.example/api/v1', appOrigin: 'https://ponte.example', token: 'a'.repeat(64) }) }));
  await messages(message => message.publication?.configured);
  const audience = new WebSocket(base + `/audience-ws/${instance.room}`, { origin: 'https://ponte.example' });
  await once(audience, 'open');
  const forbidden = new WebSocket(base + '/presenter-ws', { origin: 'https://ponte.example' });
  assert.match((await once(forbidden, 'error'))[0].message, /hang up/);
});

test('presenter resumes the same running bridge after losing its local socket', { timeout: 5000 }, async t => {
  let starts = 0;
  const logs = [];
  const { EventEmitter } = require('node:events');
  const events = new EventEmitter();
  class Bridge {
    constructor(emit) { this.emit = emit; }
    start() { starts++; this.emit({ ready: true }); }
    stop() {}
  }
  const instance = createTranslationServer({ port: 0, host: '127.0.0.1', Bridge, log: (event, metadata) => { logs.push(event); events.emit(event, metadata); } });
  t.after(() => instance.close());
  const url = new URL((await instance.listen()).presenterUrl);
  const connect = async () => {
    const socket = new WebSocket('ws://127.0.0.1:' + url.port + '/presenter-ws', { origin: 'http://127.0.0.1:' + url.port });
    const next = inbox(socket);
    await once(socket, 'open');
    socket.send(JSON.stringify({ token: url.hash.slice(1), canResume: true }));
    const state = await next(message => message.authenticated);
    return { socket, next, state };
  };
  const first = await connect();
  first.socket.send(JSON.stringify({ action: 'start', key: 'synthetic' }));
  await first.next(message => message.ready);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const recovering = once(events, 'presenter.recovery-start');
  first.socket.terminate();
  assert.equal((await recovering)[0].seconds, 600);
  t.mock.timers.tick(599999);
  const second = await connect();
  assert.equal(second.state.running, true);
  assert.equal(second.state.state, 'live');
  assert.equal(starts, 1);
  assert.ok(logs.includes('presenter.recovered'));
  const again = once(events, 'presenter.recovery-start');
  second.socket.terminate();
  await again;
  t.mock.timers.tick(600000);
  assert.ok(logs.includes('presenter.recovery-expired'));
  const third = await connect();
  assert.equal(third.state.running, false);
});

test('presenter backlog drops preview and the listener still receives translation', { timeout: 5000 }, async t => {
  let bridge, presenterSocket;
  const logs = [];
  class Bridge {
    constructor(emit) { bridge = this; this.emit = emit; }
    start() { this.emit({ ready: true }); }
    stop() {}
    audio() { this.emit({ content: { outputTranscription: { text: 'live' } } }); }
  }
  const original = WebSocket.prototype.send;
  t.mock.method(WebSocket.prototype, 'send', function(data, ...options) {
    if (typeof data === 'string' && data.includes('"authenticated":true')) presenterSocket = this;
    return original.call(this, data, ...options);
  });
  const instance = createTranslationServer({ port: 0, host: '127.0.0.1', Bridge, log: event => logs.push(event) });
  t.after(() => instance.close());
  const url = new URL((await instance.listen()).presenterUrl);
  async function connect(path) {
    const socket = new WebSocket('ws://' + url.host + path, { origin: url.origin });
    const next = inbox(socket);
    await once(socket, 'open');
    return { socket, next };
  }
  const host = await connect('/presenter-ws');
  host.socket.send(JSON.stringify({ token: url.hash.slice(1) }));
  await host.next(m => m.authenticated);
  const listener = await connect('/audience-ws/' + instance.room);
  host.socket.send(JSON.stringify({ action: 'start', key: 'test' }));
  await host.next(m => m.ready);
  let backlog = 2 * 1024 * 1024;
  Object.defineProperty(presenterSocket, 'bufferedAmount', { get: () => backlog });
  const received = [];
  host.socket.on('message', data => received.push(JSON.parse(data)));
  for (let i = 0; i < 2; i++) {
    host.socket.send(Buffer.from([1, 2]));
    await listener.next(m => m.content?.outputTranscription.text === 'live');
  }
  backlog = 0;
  bridge.emit({content: {outputTranscription: {text: 'restored'}}});
  await host.next(m => m.content?.outputTranscription.text === 'restored');
  assert.equal(received.filter(m => m.content).length, 1);
  assert.deepEqual(logs.filter(e => e.startsWith('presenter.preview')), ['presenter.preview-paused', 'presenter.preview-resumed']);
});
