const test = require("node:test"),
  assert = require("node:assert/strict"),
  { once } = require("node:events"),
  http = require("node:http");
const { selectAudienceUrl, isPrivateIPv4 } = require("./network-address.cjs");
const { createTranslationServer } = require("./server.cjs");
const { WebSocket } = require("ws");
const interfaces = {
  "Wi-Fi": [{ family: "IPv4", address: "192.168.10.20", internal: false }],
  vEthernet: [{ family: "IPv4", address: "172.20.0.1", internal: false }],
  VPN: [{ family: "IPv4", address: "10.8.0.1", internal: false }],
};
test("automatic address selection prefers the real local network and never shares loopback or public IPs", () => {
  const base = "/listen/" + "a".repeat(24);
  const links = [
    "http://localhost:3210" + base,
    ...["172.20.0.1", "10.8.0.1", "192.168.10.20"].map(
      (ip) => "http://" + ip + ":3210" + base,
    ),
  ];
  assert.equal(selectAudienceUrl(links, interfaces, "10.8.0.1"), links[3]);
  assert.equal(selectAudienceUrl([links[0]], interfaces), null);
  for (const ip of ["127.0.0.1", "169.254.1.1", "8.8.8.8", "192.168.1.999"])
    assert.equal(isPrivateIPv4(ip), false);
  assert.equal(isPrivateIPv4("172.31.1.2"), true);
});
function inbox(socket) {
  const queue = [],
    waiters = [];
  socket.on("message", (raw, binary) => {
    if (binary) return;
    const data = JSON.parse(raw);
    if (waiters.length) waiters.shift()(data);
    else queue.push(data);
  });
  return async (predicate = () => true) => {
    while (true) {
      const data = queue.length
        ? queue.shift()
        : await new Promise((resolve) => waiters.push(resolve));
      if (predicate(data)) return data;
    }
  };
}
test(
  "one action validates admin configuration, starts channels and publishes automatically; retry does not restart translation",
  { timeout: 10000 },
  async (t) => {
    const calls = [],
      bridges = [];
    let fail = true;
    const api = http.createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      calls.push({
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(raw),
      });
      res.writeHead(fail && req.url.endsWith("/publish") ? 503 : 200, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          active: true,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        }),
      );
    });
    await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
    class Bridge {
      constructor(emit) {
        this.emit = emit;
        bridges.push(this);
      }
      start(_, id) {
        this.id = id;
        this.starts = (this.starts || 0) + 1;
        this.emit({ ready: true });
      }
      stop() {}
      audio() {}
    }
    const server = createTranslationServer({
      port: 0,
      host: "127.0.0.1",
      Bridge,
      networkInterfaces: () => interfaces,
      getPreferredAddress: async () => "192.168.10.20",
    });
    t.after(async () => {
      await server.close();
      await new Promise((resolve) => api.close(resolve));
    });
    const info = await server.listen(),
      url = new URL(info.presenterUrl),
      origin = url.origin;
    const host = new WebSocket(
        origin.replace("http:", "ws:") + "/presenter-ws",
        { origin },
      ),
      next = inbox(host);
    await once(host, "open");
    host.send(JSON.stringify({ token: url.hash.slice(1) }));
    const auth = await next((m) => m.authenticated);
    assert.match(auth.audienceUrl, /192\.168\.10\.20/);
    const client = new WebSocket(
        origin.replace("http:", "ws:") + "/audience-ws/" + server.room,
        { origin },
      ),
      clientNext = inbox(client);
    await once(client, "open");
    await clientNext();
    client.send(
      JSON.stringify({
        action: "start-service",
        key: "attacker",
        configuration: "{}",
      }),
    );
    host.send(
      JSON.stringify({
        action: "start-service",
        key: "synthetic-key",
        configuration: "bad JSON",
      }),
    );
    assert.match((await next((m) => m.serviceError)).serviceError, /ligação/);
    assert.equal(bridges[0].starts, undefined);
    const configuration = JSON.stringify({
      apiUrl: "http://127.0.0.1:" + api.address().port + "/api/v1",
      appOrigin: origin,
      token: "a".repeat(64),
    });
    host.send(
      JSON.stringify({
        action: "start-service",
        key: "synthetic-key",
        configuration,
      }),
    );
    await next((m) => m.ready);
    await next((m) => m.publication?.error);
    assert.equal(bridges[0].starts, 1);
    fail = false;
    host.send(JSON.stringify({ action: "publish-service" }));
    await next((m) => m.publication?.published);
    assert.equal(bridges[0].starts, 1);
    assert.equal(calls.filter((c) => c.url.endsWith("/publish")).length, 2);
    assert.ok(
      calls.every((c) => !JSON.stringify(c.body).includes("synthetic-key")),
    );
    assert.equal(calls[1].authorization, "Bearer " + "a".repeat(64));
    assert.equal(calls[1].body.audienceUrl, auth.audienceUrl);
    const qr = await fetch(origin + "/qr/" + server.room + ".svg");
    assert.equal(
      qr.headers.get("content-type"),
      "image/svg+xml; charset=utf-8",
    );
    assert.match(await qr.text(), /<svg/);
    host.send(JSON.stringify({ action: "stop" }));
    await next((m) => m.channels?.every((c) => c.state === "idle"));
    host.close();
    client.close();
  },
);

test(
  "missing church network prevents startup and does not generate a localhost QR",
  { timeout: 5000 },
  async (t) => {
    let starts = 0;
    class Bridge {
      constructor(emit) {
        this.emit = emit;
      }
      start() {
        starts++;
        this.emit({ ready: true });
      }
      stop() {}
      audio() {}
    }
    const server = createTranslationServer({
      port: 0,
      host: "127.0.0.1",
      Bridge,
      networkInterfaces: () => ({
        lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
      }),
      getPreferredAddress: async () => null,
    });
    t.after(() => server.close());
    const info = await server.listen(),
      url = new URL(info.presenterUrl),
      origin = url.origin;
    const host = new WebSocket(
        origin.replace("http:", "ws:") + "/presenter-ws",
        { origin },
      ),
      next = inbox(host);
    await once(host, "open");
    host.send(JSON.stringify({ token: url.hash.slice(1) }));
    assert.equal((await next((m) => m.authenticated)).audienceUrl, null);
    assert.equal(
      (await fetch(origin + "/qr/" + server.room + ".svg")).status,
      503,
    );
    const configuration = JSON.stringify({
      apiUrl: origin + "/api/v1",
      appOrigin: origin,
      token: "a".repeat(64),
    });
    host.send(
      JSON.stringify({
        action: "start-service",
        key: "synthetic-key",
        configuration,
      }),
    );
    assert.match(
      (await next((m) => m.serviceError)).serviceError,
      /rede da igreja/,
    );
    assert.equal(starts, 0);
    host.close();
  },
);

test(
  "stop cancels a pending start before the translation sessions open",
  { timeout: 5000 },
  async (t) => {
    let starts = 0,
      preferredCalls = 0,
      finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    class Bridge {
      constructor(emit) {
        this.emit = emit;
      }
      start() {
        starts++;
        this.emit({ ready: true });
      }
      stop() {}
      audio() {}
    }
    const server = createTranslationServer({
      port: 0,
      host: "127.0.0.1",
      Bridge,
      networkInterfaces: () => interfaces,
      getPreferredAddress: () =>
        ++preferredCalls === 1 ? Promise.resolve("192.168.10.20") : pending,
    });
    t.after(() => server.close());
    const info = await server.listen(),
      url = new URL(info.presenterUrl),
      origin = url.origin;
    const host = new WebSocket(
        origin.replace("http:", "ws:") + "/presenter-ws",
        { origin },
      ),
      next = inbox(host);
    await once(host, "open");
    host.send(JSON.stringify({ token: url.hash.slice(1) }));
    await next((m) => m.authenticated);
    const configuration = JSON.stringify({
      apiUrl: origin + "/api/v1",
      appOrigin: origin,
      token: "a".repeat(64),
    });
    host.send(
      JSON.stringify({
        action: "start-service",
        key: "synthetic-key",
        configuration,
      }),
    );
    await next((m) => m.publication?.configured);
    host.send(JSON.stringify({ action: "stop" }));
    await next((m) => m.channels?.every((c) => c.state === "idle"));
    finish("192.168.10.20");
    await pending;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(starts, 0);
    host.close();
  },
);
