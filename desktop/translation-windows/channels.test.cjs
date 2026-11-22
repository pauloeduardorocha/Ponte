const test = require("node:test"),
  assert = require("node:assert/strict"),
  { once } = require("node:events"),
  { WebSocket } = require("ws");
const { TranslationChannels } = require("./translation-channels.cjs");
const { createTranslationServer } = require("./server.cjs");
function fixture() {
  const bridges = [],
    messages = [],
    errors = [];
  class Bridge {
    constructor(emit) {
      this.emit = emit;
      this.audioCalls = [];
      bridges.push(this);
    }
    start(key, id) {
      this.key = key;
      this.id = id;
      this.emit({ ready: true });
    }
    stop() {
      this.stopped = true;
    }
    audio(data) {
      this.audioCalls.push(Buffer.from(data));
    }
  }
  const manager = new TranslationChannels({
    Bridge,
    onMessage: (c, m) => messages.push([c.id, m]),
    onError: (c, e) => errors.push([c.id, e]),
  });
  return { manager, bridges, messages, errors, Bridge };
}
test("English starts open; three unique supported channels are allowed and last-channel close prevents starting", () => {
  const { manager: m, bridges } = fixture();
  assert.deepEqual(
    m.list().map((c) => c.id),
    ["en"],
  );
  m.add("es");
  m.add("fr");
  assert.throws(() => m.add("de"), /3 canais/);
  assert.throws(() => m.add("es"), /já tem/);
  assert.throws(() => m.add("not-a-language"), /disponível/);
  m.start("synthetic-key");
  assert.equal(m.state, "live");
  assert.deepEqual(
    bridges.map((b) => b.id),
    ["en", "es", "fr"],
  );
  assert.throws(() => m.start("other"), /andamento/);
  m.remove("en");
  m.remove("es");
  m.remove("fr");
  assert.equal(m.running, false);
  assert.equal(m.key, "");
  assert.throws(() => m.start("synthetic-key"), /pelo menos um canal/);
  m.add("pt-PT");
  assert.equal(m.list()[0].state, "idle");
  m.stop();
});
test("live additions share microphone input, failures stay isolated, and removed callbacks cannot contaminate reopened channels", () => {
  const { manager: m, bridges } = fixture();
  m.start("synthetic-key");
  m.add("es");
  m.audio(Buffer.from([1, 2]));
  assert.equal(bridges[0].audioCalls.length, 1);
  assert.equal(bridges[1].audioCalls.length, 1);
  bridges[0].emit({ content: { outputTranscription: { text: "English" } } });
  bridges[1].emit({ content: { outputTranscription: { text: "Español" } } });
  assert.equal(m.channels.get("en").transcript, "English");
  assert.equal(m.channels.get("es").transcript, "Español");
  bridges[1].emit({ error: "private diagnostic" });
  assert.equal(m.channels.get("es").state, "error");
  assert.equal(m.channels.get("en").state, "live");
  assert.equal(m.running, true);
  m.audio(Buffer.from([3, 4]));
  assert.equal(bridges[1].audioCalls.length, 1);
  m.retry("es");
  assert.equal(m.channels.get("es").state, "live");
  m.clear("en");
  assert.equal(m.channels.get("en").transcript, "");
  m.remove("es");
  m.add("es");
  bridges[1].emit({ content: { outputTranscription: { text: "stale" } } });
  assert.equal(m.channels.get("es").transcript, "");
  m.stop();
  assert.equal(m.key, "");
  assert.ok(bridges.every((b) => b.stopped));
});
function inbox(socket) {
  const queue = [],
    waiting = [];
  socket.on("message", (raw, binary) => {
    const data = binary ? { audio: raw } : JSON.parse(raw);
    if (waiting.length) waiting.shift()(data);
    else queue.push(data);
  });
  return async (predicate = () => true) => {
    while (true) {
      const data = queue.length
        ? queue.shift()
        : await new Promise((resolve) => waiting.push(resolve));
      if (predicate(data)) return data;
    }
  };
}
test(
  "listeners discover channels, switch isolated transcripts, receive closures, and cannot manage the presenter",
  { timeout: 12000 },
  async (t) => {
    const bridges = [];
    class Bridge {
      constructor(emit) {
        this.emit = emit;
        bridges.push(this);
      }
      start(key, id) {
        this.id = id;
        this.emit({ ready: true });
      }
      stop() {}
      audio() {}
    }
    const server = createTranslationServer({
      port: 0,
      host: "127.0.0.1",
      Bridge,
    });
    t.after(() => server.close());
    const info = await server.listen(),
      url = new URL(info.presenterUrl),
      base = url.origin.replace("localhost", "127.0.0.1");
    async function connect(route) {
      const socket = new WebSocket(base.replace("http:", "ws:") + route, {
        origin: base,
      });
      const next = inbox(socket);
      await once(socket, "open");
      return { socket, next };
    }
    const host = await connect("/presenter-ws");
    host.socket.send(JSON.stringify({ token: url.hash.slice(1) }));
    const auth = await host.next((m) => m.authenticated);
    assert.deepEqual(
      auth.channels.map((c) => c.id),
      ["en"],
    );
    const first = await connect("/audience-ws/" + server.room),
      second = await connect("/audience-ws/" + server.room);
    await first.next();
    await second.next();
    first.socket.send(
      JSON.stringify({ action: "open-channel", languageCode: "de" }),
    );
    host.socket.send(
      JSON.stringify({ action: "open-channel", languageCode: "es" }),
    );
    host.socket.send(
      JSON.stringify({ action: "open-channel", languageCode: "fr" }),
    );
    const list = await first.next((m) => m.channels?.length === 3);
    assert.deepEqual(
      list.channels.map((c) => c.id),
      ["en", "es", "fr"],
    );
    assert.ok(!JSON.stringify(list).includes("synthetic-key"));
    host.socket.send(
      JSON.stringify({ action: "open-channel", languageCode: "de" }),
    );
    assert.match(
      (await host.next((m) => m.channelError)).channelError,
      /3 canais/,
    );
    host.socket.send(JSON.stringify({ action: "start", key: "synthetic-key" }));
    await host.next((m) => m.channelId === "fr" && m.ready);
    first.socket.send(
      JSON.stringify({ action: "select-channel", channelId: "es" }),
    );
    const ack = await first.next((m) => m.selectedChannel === "es");
    assert.equal(ack.snapshot, "");
    bridges
      .find((b) => b.id === "en")
      .emit({ content: { outputTranscription: { text: "Welcome" } } });
    bridges
      .find((b) => b.id === "es")
      .emit({ content: { outputTranscription: { text: "Bienvenidos" } } });
    const spanish = await first.next((m) => m.content);
    assert.equal(spanish.channelId, "es");
    assert.equal(spanish.content.outputTranscription.text, "Bienvenidos");
    const english = await second.next((m) => m.content);
    assert.equal(english.channelId, "en");
    assert.equal(english.content.outputTranscription.text, "Welcome");
    first.socket.send(
      JSON.stringify({ action: "select-channel", channelId: "en" }),
    );
    assert.equal(
      (await first.next((m) => m.selectedChannel === "en")).snapshot,
      "Welcome",
    );
    first.socket.send(
      JSON.stringify({ action: "select-channel", channelId: "invalid" }),
    );
    assert.match(
      (await first.next((m) => m.selectionError)).selectionError,
      /disponível/,
    );
    assert.equal(
      (await fetch(base + "/audio/" + server.room + ".mp3?channel=invalid"))
        .status,
      404,
    );
    const esStream = await fetch(
      base + "/audio/" + server.room + ".mp3?channel=es",
    );
    assert.equal(esStream.status, 200);
    assert.match(esStream.headers.get("content-type"), /audio\/mpeg/);
    const reader = esStream.body.getReader();
    assert.ok((await reader.read()).value.length);
    first.socket.send(
      JSON.stringify({ action: "select-channel", channelId: "es" }),
    );
    await first.next((m) => m.selectedChannel === "es");
    host.socket.send(
      JSON.stringify({ action: "close-channel", channelId: "es" }),
    );
    const closed = await first.next((m) => m.channelClosed);
    assert.equal(closed.selectedChannel, null);
    assert.equal(closed.snapshot, "");
    while (!(await reader.read()).done) {
      /* drain stream closed with channel */
    }
    assert.equal(
      (await fetch(base + "/audio/" + server.room + ".mp3?channel=es")).status,
      404,
    );
    bridges
      .find((b) => b.id === "en")
      .emit({ content: { outputTranscription: { text: " still live" } } });
    assert.equal(
      (await second.next((m) => m.content)).content.outputTranscription.text,
      " still live",
    );
    host.socket.send(
      JSON.stringify({ action: "close-channel", channelId: "en" }),
    );
    host.socket.send(
      JSON.stringify({ action: "close-channel", channelId: "fr" }),
    );
    await host.next((m) => m.channels?.length === 0);
    host.socket.send(JSON.stringify({ action: "start", key: "synthetic-key" }));
    assert.match(
      (await host.next((m) => m.channelError)).channelError,
      /pelo menos um canal/,
    );
  },
);

test("transient failure resumes one channel, preserves text and cancels pending retries on stop", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { manager, bridges } = fixture();
  manager.add("es");
  manager.start("synthetic");
  bridges[0].emit({ content: { outputTranscription: { text: "before" } } });
  const fail = () => bridges[0].emit({ error: "offline", retryable: true });
  fail();
  assert.deepEqual(manager.list().map(c => c.state), ["connecting", "live"]);
  t.mock.timers.tick(1000);
  assert.equal(manager.channels.get("en").transcript, "before");
  assert.equal(manager.channels.get("en").state, "live");
  fail();
  manager.stop();
  t.mock.timers.tick(60000);
  assert.equal(manager.channels.get("en").state, "idle");
});
