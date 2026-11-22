const test = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { TranslationBridge } = require("./bridge.cjs");
test("each Gemini bridge configures its channel target and redacts its key from errors", (t) => {
  const sockets = [],
    events = [];
  class Socket extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.sent = [];
      this.readyState = 1;
      sockets.push(this);
    }
    send(raw) {
      this.sent.push(JSON.parse(raw));
    }
    terminate() {
      this.terminated = true;
    }
  }
  const bridge = new TranslationBridge((m) => events.push(m), Socket);
  t.after(() => bridge.stop());
  bridge.start("synthetic-private-key", "es");
  sockets[0].emit("open");
  assert.equal(
    sockets[0].sent[0].setup.generationConfig.translationConfig
      .targetLanguageCode,
    "es",
  );
  assert.ok(
    !JSON.stringify(sockets[0].sent[0]).includes("synthetic-private-key"),
  );
  sockets[0].emit("message", JSON.stringify({ setupComplete: {} }));
  assert.equal(events[0].ready, true);
  bridge.audio(Buffer.from([1, 2]));
  assert.equal(
    sockets[0].sent[1].realtimeInput.audio.mimeType,
    "audio/pcm;rate=16000",
  );
  sockets[0].emit(
    "message",
    JSON.stringify({ error: { message: "Denied synthetic-private-key" } }),
  );
  assert.ok(!events.at(-1).error.includes("synthetic-private-key"));
  bridge.start("synthetic-private-key", "pt-PT");
  sockets[1].emit("open");
  assert.equal(
    sockets[1].sent[0].setup.generationConfig.translationConfig
      .targetLanguageCode,
    "pt-PT",
  );
  const count = events.length;
  sockets[0].emit(
    "message",
    JSON.stringify({
      serverContent: { outputTranscription: { text: "stale" } },
    }),
  );
  assert.equal(events.length, count);
});

test('unanswered Gemini heartbeat fails once and requests recovery', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let socket;
  class Socket extends EventEmitter {
    constructor() { super(); socket = this; }
    ping() {}
    terminate() {}
  }
  const events = [];
  const bridge = new TranslationBridge(message => events.push(message), Socket);
  bridge.start('test');
  socket.emit('message', '{"setupComplete":{}}');
  t.mock.timers.tick(30000);
  t.mock.timers.tick(30000);
  socket.emit('close', 1006);
  assert.deepEqual(events.map(e => e.reason), [undefined, 'heartbeat-timeout']);
  assert.equal(events[1].retryable, true);
});

test('diagnostics rotate readable timestamped records and tolerate unavailable storage', t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { createDiagnostics } = require('./diagnostics.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translation-log-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'traducao.txt');
  fs.writeFileSync(file, Buffer.alloc(1024 * 1024));
  createDiagnostics(dir)('gemini.failure', {channel: 'en', code: 1006});
  assert.equal(fs.statSync(file + '.1').size, 1024 * 1024);
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(entry.event, 'gemini.failure');
  assert.ok(Date.parse(entry.time));
  fs.writeFileSync(file, Buffer.alloc(1024 * 1024 - 1));
  createDiagnostics(dir)('presenter.recovery-start', { seconds: 600 });
  assert.equal(fs.statSync(file + '.1').size, 1024 * 1024 - 1);
  assert.ok(fs.statSync(file).size < 1024);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['traducao.txt', 'traducao.txt.1']);
  assert.doesNotThrow(() => createDiagnostics(file)('desktop.start'));
});
