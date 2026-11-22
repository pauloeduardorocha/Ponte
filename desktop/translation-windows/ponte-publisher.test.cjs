const test = require('node:test');
const assert = require('node:assert/strict');
const { PontePublisher } = require('./ponte-publisher.cjs');
test('publication uses a scoped token, rejects unsafe configurations, and withdraws on stop', async () => {
  const requests = [], events = [];
  const publisher = new PontePublisher(event => events.push(event), async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ expiresAt: new Date(Date.now() + 120000).toISOString() }) }; });
  const configuration = { apiUrl: 'https://ponte.example/api/v1', token: 'a'.repeat(64) };
  assert.throws(() => publisher.configure(JSON.stringify({ ...configuration, apiUrl: 'http://external.example/api/v1' })));
  publisher.configure(JSON.stringify(configuration));
  await publisher.publish('http://192.168.1.2:3210/listen/' + 'a'.repeat(24));
  assert.equal(events.at(-1).publication.published, true);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + configuration.token);
  assert.throws(() => publisher.configure(JSON.stringify(configuration)));
  await publisher.unpublish();
  assert.equal(events.at(-1).publication.published, false);
  assert.ok(requests[1].url.endsWith('/unpublish'));
  assert.equal(JSON.parse(requests[0].options.body).sessionId, JSON.parse(requests[1].options.body).sessionId);
});
test('a stop during publication withdraws a late publish response', async () => {
  let release, calls = 0;
  const publisher = new PontePublisher(() => {}, async () => {
    if (++calls === 1) await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => ({}) };
  });
  publisher.configure(JSON.stringify({ apiUrl: 'https://ponte.example/api/v1', token: 'a'.repeat(64) }));
  const pending = publisher.publish('http://192.168.1.2:3210/listen/' + 'a'.repeat(24));
  await publisher.unpublish(); release(); await pending;
  assert.equal(publisher.published, false); assert.equal(calls, 2);
});
test('presence renewal stops when publication is withdrawn', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const requests = [];
  const publisher = new PontePublisher(() => {}, async url => { requests.push(url); return { ok: true, json: async () => ({}) }; });
  publisher.configure(JSON.stringify({ apiUrl: 'https://ponte.example/api/v1', token: 'a'.repeat(64) }));
  await publisher.publish('http://192.168.1.2:3210/listen/' + 'a'.repeat(24));
  t.mock.timers.tick(30000); await new Promise(setImmediate);
  assert.equal(requests.filter(url => url.endsWith('/publish')).length, 2);
  await publisher.unpublish();
  t.mock.timers.tick(90000); await new Promise(setImmediate);
  assert.equal(requests.filter(url => url.endsWith('/publish')).length, 2);
});

test('temporary publication failures recover and revoked credentials stop retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  const statuses = [503, 200, 401];
  const publisher = new PontePublisher(() => {}, async () => {
    calls++;
    const status = statuses.shift();
    return { status, ok: status === 200, json: async () => ({}) };
  });
  publisher.configure(JSON.stringify({ apiUrl: 'https://ponte.example', token: 'b'.repeat(64) }));
  await assert.rejects(publisher.publish('http://192.168.1.2'));
  t.mock.timers.tick(30000); await new Promise(setImmediate);
  assert.equal(publisher.published, true);
  t.mock.timers.tick(30000); await new Promise(setImmediate);
  assert.equal(publisher.published, false);
  assert.deepEqual(statuses, []);
  t.mock.timers.tick(60000); await new Promise(setImmediate);
  assert.equal(calls, 3);
});

test('republication keeps the minute interval beyond 250 attempts and wakes on network recovery', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0, available = false;
  const publisher = new PontePublisher(() => {}, async () => {
    calls++;
    if (!available) throw Error('offline');
    return { ok: true, json: async () => ({}) };
  });
  publisher.configure(JSON.stringify({ apiUrl: 'https://ponte.example', token: 'b'.repeat(64) }));
  await assert.rejects(publisher.publish('http://192.168.1.2'));
  const advance = async ms => { t.mock.timers.tick(ms); await new Promise(setImmediate); };
  const delays = [3, 6, 12, 24, 48, ...Array(246).fill(60)];
  for (const seconds of delays) {
    const before = calls;
    await advance(seconds * 1000 - 1);
    assert.equal(calls, before);
    await advance(1);
    assert.equal(calls, before + 1);
  }
  const before = calls;
  available = true;
  publisher.retryNow?.();
  publisher.retryNow?.();
  await new Promise(setImmediate);
  assert.equal(calls, before + 1);
  assert.equal(publisher.published, true);
  available = false;
  await advance(30000); // renewal fails
  await advance(2999);
  assert.equal(calls, before + 2);
  await advance(1); // new outage starts again at three seconds
  assert.equal(calls, before + 3);
  await publisher.unpublish();
  const stopped = calls;
  publisher.retryNow?.();
  await advance(60000);
  assert.equal(calls, stopped);
});

test('presenter forwards Windows connectivity recovery after authentication and prioritizes stop', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const events = {}, actions = [], window = { addEventListener: (name, fn) => { events[name] = fn; } };
  let socket;
  class Socket {
    static OPEN = 1;
    readyState = 1;
    constructor() { socket = this; }
    send(message) { actions.push(JSON.parse(message).action); }
  }
  vm.runInNewContext(fs.readFileSync(__dirname + '/transport.js', 'utf8'), {
    window, WebSocket: Socket, history: {replaceState() {}},
    location: { hash: '#test', protocol: 'http:', host: 'localhost', pathname: '/' },
    setTimeout: callback => callback(),
  });
  const authenticate = () => socket.onmessage({data: '{"authenticated":true}'});
  events.online();
  assert.deepEqual(actions, []);
  authenticate();
  events.online();
  assert.deepEqual(actions, ['network-online', 'network-online']);
  socket.onclose({code: 1006});
  events.online();
  window.translator.stop();
  authenticate();
  assert.deepEqual(actions, ['network-online', 'network-online', 'stop']);
});
