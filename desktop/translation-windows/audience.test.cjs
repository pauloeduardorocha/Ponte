const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
function player(play = async () => {}) {
  const handlers = {},
    actions = {},
    audio = {
      src: "",
      pause() {
        handlers.pause?.();
      },
      removeAttribute() {
        this.src = "";
      },
      load() {
        this.loads = (this.loads || 0) + 1;
      },
      play,
      addEventListener(name, handler) {
        handlers[name] = handler;
      },
    };
  const status = {},
    navigator = {
      mediaSession: {
        setActionHandler(name, handler) {
          actions[name] = handler;
        },
      },
    },
    window = { addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(__dirname + "/radio.js", "utf8"), {
    document: {
      getElementById: (id) => ({ radio: audio, "radio-status": status })[id],
    },
    location: { pathname: "/listen/room" },
    navigator,
    setTimeout, clearTimeout,
    window,
  });
  let state;
  window.translationPlayer.subscribe((value) => {
    state = value;
  });
  window.translationPlayer.selectChannel("en", "English", "live");
  return {
    audio,
    status,
    actions,
    handlers,
    navigator,
    player: window.translationPlayer,
    get state() {
      return state;
    },
  };
}
test("a flag tap starts native audio without a play button; another tap pauses and resumes live", async () => {
  let plays = 0;
  const p = player(async () => {
    plays++;
  });
  assert.equal(p.audio.src, "");
  p.player.activateChannel("en", "English", "live");
  await Promise.resolve();
  p.handlers.playing();
  assert.equal(p.audio.src, "/audio/room.mp3?channel=en");
  assert.equal(p.state.phase, "playing");
  p.player.activateChannel("en", "English", "live");
  assert.equal(p.audio.src, "");
  assert.equal(p.state.phase, "paused");
  p.player.activateChannel("en", "English", "live");
  await Promise.resolve();
  assert.equal(plays, 2);
  assert.equal(p.audio.src, "/audio/room.mp3?channel=en");
});
test("lock-screen play, pause and stop use the same native media stream", async () => {
  const p = player();
  p.actions.play();
  await Promise.resolve();
  p.handlers.playing();
  assert.equal(p.navigator.mediaSession.playbackState, "playing");
  p.actions.pause();
  assert.equal(p.audio.src, "");
  p.actions.play();
  await Promise.resolve();
  assert.equal(p.audio.src, "/audio/room.mp3?channel=en");
  p.actions.stop();
  assert.equal(p.state.phase, "paused");
});
test("failed playback can be retried by tapping the same flag", async () => {
  let plays = 0;
  const p = player(async () => {
    if (++plays === 1) throw Error("blocked");
  });
  p.player.activateChannel("en", "English", "live");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(p.state.phase, "error");
  assert.match(p.status.textContent, /Não foi possível/);
  p.player.activateChannel("en", "English", "live");
  await Promise.resolve();
  p.handlers.playing();
  assert.equal(p.state.phase, "playing");
  assert.equal(plays, 2);
});
test("late play rejection cannot overwrite a newer pause action", async () => {
  let reject;
  const p = player(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  p.player.activateChannel("en", "English", "live");
  p.actions.pause();
  reject(Error("aborted"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(p.state.phase, "paused");
  assert.match(p.status.textContent, /pausado/);
});
test("another flag replaces the audio immediately and closing that channel stops playback", async () => {
  const p = player();
  p.player.activateChannel("en", "English", "live");
  await Promise.resolve();
  p.handlers.playing();
  p.player.activateChannel("es", "Español", "live");
  await Promise.resolve();
  assert.equal(p.audio.src, "/audio/room.mp3?channel=es");
  p.handlers.playing();
  assert.match(p.status.textContent, /Español/);
  p.player.selectChannel(null, "", "idle");
  assert.equal(p.audio.src, "");
  assert.equal(p.state.active, false);
  p.actions.play();
  assert.equal(p.audio.src, "");
});
test("a tap on a waiting channel resumes audio as soon as it goes live", async () => {
  const p = player();
  p.player.activateChannel("es", "Español", "idle");
  assert.equal(p.audio.src, "");
  p.player.updateState("live");
  assert.equal(p.audio.src, "/audio/room.mp3?channel=es");
  await Promise.resolve();
  assert.equal(p.audio.src, "/audio/room.mp3?channel=es");
  p.player.updateState("idle");
  assert.equal(p.audio.src, "");
});

test("interrupted audio retries automatically, manual pause cancels the retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const p = player(async () => { attempts++; });
  p.player.activateChannel("en", "English", "live");
  await Promise.resolve();
  p.handlers.error();
  t.mock.timers.tick(3000);
  await Promise.resolve();
  assert.equal(attempts, 2);
  p.handlers.ended();
  p.player.pause();
  t.mock.timers.tick(10000);
  assert.equal(attempts, 2);
});
