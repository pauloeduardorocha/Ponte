const { app, BrowserWindow, session } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict"),
  jsQR = require("jsqr");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (const flag of [
  "use-fake-device-for-media-stream",
  "use-fake-ui-for-media-stream",
  "mute-audio",
])
  app.commandLine.appendSwitch(flag);
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : app.getPath("temp");
app.whenReady().then(async () => {
  let server, api, timer;
  const windows = [],
    bridges = [],
    errors = [],
    calls = [];
  try {
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(true),
    );
    let failPublication = true;
    api = http.createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw);
      assert.equal(req.headers.authorization, "Bearer " + "a".repeat(64));
      calls.push({ url: req.url, ...data });
      res.writeHead(
        failPublication && req.url.endsWith("/publish") ? 503 : 200,
        { "Content-Type": "application/json" },
      );
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
        this.inputs = 0;
        this.starts = 0;
        bridges.push(this);
      }
      start(key, id) {
        assert.equal(key, "synthetic-smoke-key");
        this.id = id;
        this.starts++;
        this.live = true;
        this.emit({ ready: true });
      }
      stop() {
        this.live = false;
      }
      audio() {
        this.inputs++;
      }
    }
    server = require("./server.cjs").createTranslationServer({
      port: 0,
      host: "127.0.0.1",
      Bridge,
      networkInterfaces: () => ({
        "Wi-Fi": [
          { family: "IPv4", address: "192.168.10.20", internal: false },
        ],
      }),
      getPreferredAddress: async () => "192.168.10.20",
    });
    const info = await server.listen(),
      origin = new URL(info.presenterUrl).origin;
    const pcm = Buffer.alloc(9600);
    for (let i = 0; i < 4800; i++)
      pcm.writeInt16LE(
        Math.round(5000 * Math.sin((2 * Math.PI * 440 * i) / 24000)),
        i * 2,
      );
    const words = {
      en: "Hello everyone. ",
      es: "Hola a todos. ",
      fr: "Bonjour à tous. ",
    };
    timer = setInterval(() => {
      for (const bridge of bridges)
        if (bridge.live)
          bridge.emit({
            content: {
              outputTranscription: { text: words[bridge.id] || bridge.id },
              modelTurn: {
                parts: [
                  {
                    inlineData: {
                      data: pcm.toString("base64"),
                      mimeType: "audio/pcm;rate=24000",
                    },
                  },
                ],
              },
            },
          });
    }, 200);
    async function window(url, width) {
      const win = new BrowserWindow({
        show: false,
        width,
        height: 1200,
        webPreferences: { sandbox: true, backgroundThrottling: false },
      });
      windows.push(win);
      win.webContents.on("console-message", (_event, ...args) => {
        if (
          args.some(
            (value) => typeof value === "string" && value.includes("Uncaught"),
          )
        )
          errors.push(args);
      });
      await win.loadURL(url);
      return win;
    }
    const run = (win, code) => win.webContents.executeJavaScript(code, true);
    async function until(win, code) {
      for (let i = 0; i < 100; i++) {
        if (await run(win, code)) return;
        await wait(100);
      }
      throw Error("Timed out: " + code);
    }
    const host = await window(info.presenterUrl, 1280);
    await until(
      host,
      "document.querySelectorAll('.channel-panel').length===3 && !document.getElementById('start').disabled",
    );
    assert.deepEqual(
      await run(
        host,
        "[...document.querySelectorAll('input,select')].slice(0,3).map(el=>el.id)",
      ),
      ["key", "ponte-config", "microphone"],
    );
    assert.equal(
      await run(
        host,
        "document.querySelectorAll('.channel-panel.is-inactive').length",
      ),
      2,
    );
    assert.equal(
      await run(
        host,
        "!!document.getElementById('audience-address') || !!document.getElementById('publish') || !!document.getElementById('connect-ponte')",
      ),
      false,
    );
    await run(
      host,
      "document.getElementById('key').value='synthetic-smoke-key';document.getElementById('start').click()",
    );
    await until(
      host,
      "document.getElementById('status').textContent.includes('administrador')",
    );
    assert.equal(bridges[0].starts, 0);
    await until(
      host,
      "document.getElementById('audience-qr').complete && document.getElementById('audience-qr').naturalWidth>0",
    );
    const pixels = await run(
      host,
      "(()=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(document.getElementById('audience-qr'),0,0,512,512);return [...c.getImageData(0,0,512,512).data];})()",
    );
    const decoded = jsQR(new Uint8ClampedArray(pixels), 512, 512);
    assert.ok(decoded, "QR must decode with an independent reader");
    assert.equal(
      decoded.data,
      await run(host, "document.getElementById('audience-link').href"),
    );
    assert.ok(
      !decoded.data.includes("presenter") &&
        !decoded.data.includes("synthetic"),
    );
    host.setSize(1280, 1640);
    await wait(200);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, "presenter-inactive.png"),
      (await host.webContents.capturePage()).toPNG(),
    );
    const listener = await window(origin + "/listen/" + server.room, 390);
    async function checkListenerColumns(count) {
      await until(
        listener,
        `document.querySelectorAll('#listener-channel button').length===${count} && [...document.querySelectorAll('#listener-channel img')].every(img=>img.complete && img.naturalWidth>0)`,
      );
      const layout = await run(
        listener,
        "(()=>{const grid=document.getElementById('listener-channel'),s=getComputedStyle(grid);return {columns:s.gridTemplateColumns.split(' ').length,width:grid.getBoundingClientRect().width,gap:parseFloat(s.columnGap),tiles:[...grid.children].map(el=>({width:el.getBoundingClientRect().width,name:el.getAttribute('aria-label')}))};})()",
      );
      assert.equal(layout.columns, count);
      for (const tile of layout.tiles) {
        assert.ok(
          Math.abs(
            tile.width - (layout.width - layout.gap * (count - 1)) / count,
          ) < 1,
        );
        assert.ok(tile.name);
      }
      await wait(200);
      fs.writeFileSync(
        path.join(output, `listener-${count}-channels.png`),
        (await listener.webContents.capturePage()).toPNG(),
      );
    }
    await checkListenerColumns(1);
    await until(
      listener,
      "!document.getElementById('broadcast-notice').hidden",
    );
    assert.equal(
      await run(listener, "document.getElementById('listen')"),
      null,
    );
    assert.equal(
      await run(listener, "document.getElementById('radio').currentSrc"),
      "",
    );
    assert.equal(
      await run(listener, "document.querySelector('.brand').innerText.trim()"),
      "A Ponte",
    );
    assert.equal(
      await run(
        listener,
        "document.querySelectorAll('h1,h2,p:not(.broadcast-notice p):not([hidden]),footer,details,.listener-channel-state').length",
      ),
      0,
    );
    assert.match(
      await run(
        listener,
        "document.getElementById('broadcast-notice').textContent",
      ),
      /Aguardando a transmissão[\s\S]*Pode manter esta página aberta/,
    );
    fs.writeFileSync(
      path.join(output, "listener-waiting.png"),
      (await listener.webContents.capturePage()).toPNG(),
    );
    const configuration = JSON.stringify({
      apiUrl: "http://127.0.0.1:" + api.address().port + "/api/v1",
      token: "a".repeat(64),
      appOrigin: origin,
    });
    await run(
      host,
      `document.getElementById('ponte-config').value=${JSON.stringify(configuration)};document.getElementById('start').click()`,
    );
    await until(
      host,
      "document.getElementById('start').textContent==='Tentar publicar'",
    );
    assert.equal(bridges[0].starts, 1);
    await run(host, "stream.getAudioTracks()[0].stop(); stream.getAudioTracks()[0].dispatchEvent(new Event('ended'))");
    await until(host, "!document.getElementById('microphone-notice').hidden && document.activeElement.id==='microphone'");
    await run(host, "document.getElementById('refresh').click()");
    await until(host, "document.getElementById('microphone-notice').hidden && stream.active");
    assert.equal(bridges[0].starts, 1);
    failPublication = false;
    await run(host, "document.getElementById('start').click()");
    await until(
      host,
      "document.getElementById('start').textContent==='Tradução publicada'",
    );
    assert.equal(bridges[0].starts, 1);
    assert.equal(
      calls.filter((call) => call.url.endsWith("/publish")).length,
      2,
    );
    assert.equal(calls[1].audienceUrl, decoded.data);
    for (const [slot, id] of [
      [1, "es"],
      [2, "fr"],
    ]) {
      await run(
        host,
        `document.getElementById('slot-language-${slot}').value='${id}';document.querySelector('[aria-label="Abrir canal ${slot + 1}"]').click()`,
      );
      await until(host, `!!document.getElementById('text-${id}')`);
      await checkListenerColumns(slot + 1);
    }
    assert.equal(
      await run(host, "document.querySelectorAll('.channel-panel').length"),
      3,
    );
    assert.equal(
      await run(
        host,
        "document.querySelectorAll('.channel-panel.is-inactive').length",
      ),
      0,
    );
    assert.equal(
      await run(
        host,
        "getComputedStyle(document.getElementById('channel-list')).gridTemplateColumns.split(' ').length",
      ),
      3,
    );
    await until(
      host,
      "document.getElementById('text-fr').textContent.includes('Bonjour')",
    );
    await until(listener, "document.getElementById('broadcast-notice').hidden");
    await until(
      listener,
      "document.querySelectorAll('#listener-channel button').length===3",
    );
    assert.equal(
      await run(listener, "document.getElementById('text').hidden"),
      true,
    );
    await run(
      listener,
      "document.querySelector('#listener-channel [data-channel-id=en]').click()",
    );
    await until(listener, "document.getElementById('radio').currentTime>0");
    await until(listener, "!document.getElementById('text').hidden");
    for (const id of ["es", "en", "fr", "es"]) {
      await run(
        listener,
        `document.querySelector('#listener-channel [data-channel-id="${id}"]').click()`,
      );
      await until(
        listener,
        `document.getElementById('text').textContent.includes('${id === "en" ? "Hello" : id === "es" ? "Hola" : "Bonjour"}')`,
      );
    }
    await until(
      listener,
      "document.getElementById('radio').currentTime>0 && document.getElementById('radio').src.includes('channel=es')",
    );
    assert.equal(
      await run(
        listener,
        "document.getElementById('text').textContent.includes('Hello') || document.getElementById('text').textContent.includes('Bonjour')",
      ),
      false,
    );
    await run(
      listener,
      "document.querySelector('#listener-channel [data-channel-id=es]').click()",
    );
    await until(listener, "document.getElementById('radio').paused");
    assert.match(
      await run(listener, "document.getElementById('text').textContent"),
      /Hola/,
    );
    await run(
      listener,
      "document.querySelector('#listener-channel [data-channel-id=es]').click()",
    );
    await until(
      listener,
      "!document.getElementById('radio').paused && document.getElementById('radio').currentTime>0",
    );
    await wait(200);
    fs.writeFileSync(
      path.join(output, "listener-minimal-active.png"),
      (await listener.webContents.capturePage()).toPNG(),
    );
    for (const win of [host, listener])
      assert.ok(
        await run(win, "document.documentElement.scrollWidth<=innerWidth"),
        "viewport overflow",
      );
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, "presenter-columns.png"),
      (await host.webContents.capturePage()).toPNG(),
    );
    await run(
      host,
      "document.querySelector('[aria-label=\"Fechar canal Espanhol\"]').click()",
    );
    await until(
      host,
      "document.querySelectorAll('.channel-panel.is-inactive').length===1",
    );
    await until(
      listener,
      "document.getElementById('listener-channel').dataset.selectedChannel==='' && document.getElementById('radio').paused && document.getElementById('text').hidden",
    );
    assert.equal(
      await run(
        host,
        "document.getElementById('text-fr').closest('article').dataset.slot",
      ),
      "2",
    );
    bridges
      .find((b) => b.id === "en")
      .emit({ error: "simulated channel failure" });
    await until(
      host,
      "!!document.querySelector('[aria-label=\"Reconectar canal Inglês\"]')",
    );
    await run(
      host,
      "document.querySelector('[aria-label=\"Reconectar canal Inglês\"]').click()",
    );
    await until(
      host,
      "!document.querySelector('[aria-label=\"Reconectar canal Inglês\"]')",
    );
    assert.ok(bridges.filter((b) => b.live).every((b) => b.inputs > 0));
    await run(host, "document.getElementById('stop').click()");
    await until(
      host,
      "document.getElementById('stop').disabled && !document.getElementById('start').disabled",
    );
    assert.ok(bridges.every((b) => !b.live));
    await until(
      listener,
      "!document.getElementById('broadcast-notice').hidden",
    );
    await server.close();
    server = null;
    await until(listener, "!document.getElementById('reconnect-portal').hidden");
    assert.equal(await run(listener, "document.querySelector('#reconnect-portal a').href"), "https://igrejaponte.com/listen-translation");
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(
      "PASS: ordered setup, three stable columns, inactive panels, one-action start/publish, retry without restart, independently decoded QR, native audio switching, and stop.",
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    clearInterval(timer);
    for (const win of windows) win.destroy();
    await server?.close();
    if (api) await new Promise((resolve) => api.close(resolve));
    app.exit(process.exitCode || 0);
  }
});
