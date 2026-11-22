(() => {
  const audio = document.getElementById("radio"),
    status = document.getElementById("radio-status"),
    room = location.pathname.split("/").pop(),
    observers = new Set();
  let generation = 0,
    active = false,
    wanted = false,
    retryTimer,
    channelId = null,
    channelName = "",
    state = "idle",
    phase = "idle";
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {
    /* optional */
  }
  function mediaState(value) {
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = value;
  }
  function emit(message) {
    if (message) status.textContent = message;
    for (const observer of observers)
      observer({ channelId, active, wanted, phase, state });
  }
  function release() {
    clearTimeout(retryTimer);
    generation++;
    active = false;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    mediaState("paused");
  }
  function pause() {
    wanted = false;
    release();
    phase = "paused";
    emit(
      channelId
        ? "Áudio pausado. Toque na bandeira para retomar ao vivo."
        : "Escolha outro canal para continuar.",
    );
  }
  async function start() {
    wanted = Boolean(channelId);
    clearTimeout(retryTimer);
    if (!channelId || state !== "live") {
      phase = "waiting";
      emit("Este canal ainda não está ao vivo. Aguarde o apresentador.");
      return;
    }
    const attempt = ++generation;
    active = true;
    phase = "connecting";
    emit("Conectando ao canal " + channelName + "…");
    audio.src =
      "/audio/" + room + ".mp3?channel=" + encodeURIComponent(channelId);
    audio.load();
    try {
      await audio.play();
    } catch (error) {
      if (attempt !== generation) return;
      active = false;
      if (error?.name === "NetworkError" || audio.error?.code === 2) {
        retryPlayback();
        return;
      }
      wanted = false;
      phase = "error";
      mediaState("none");
      emit(
        "Não foi possível ouvir. Confira o Wi-Fi e toque novamente na bandeira.",
      );
    }
  }
  function selectChannel(id, name, nextState) {
    if (id === channelId) {
      updateState(nextState);
      return;
    }
    wanted = false;
    release();
    channelId = id;
    channelName = name || "";
    state = nextState || "idle";
    phase = "idle";
    if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined")
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Tradução ao vivo — " + channelName,
        artist: "A Ponte",
        artwork: [
          {
            src: new URL("/logo.png", location.origin).href,
            type: "image/png",
          },
        ],
      });
    emit(
      id
        ? "Canal " + channelName + " selecionado."
        : "O canal foi fechado. Escolha outro canal para continuar.",
    );
  }
  function activateChannel(id, name, nextState) {
    if (id === channelId && wanted) {
      pause();
      return;
    }
    selectChannel(id, name, nextState);
    void start();
  }
  function updateState(next) {
    const wasLive = state === "live";
    state = next || "idle";
    if (state !== "live" && active) {
      release();
      phase = state === "error" ? "error" : "waiting";
      emit("O canal não está ao vivo. Escolha outro ou aguarde.");
    } else if (!wasLive && state === "live" && wanted) void start();
    else emit();
  }
  audio.addEventListener("playing", () => {
    if (!channelId || !active) return;
    phase = "playing";
    mediaState("playing");
    emit("Reproduzindo ao vivo · " + channelName);
  });
  audio.addEventListener("pause", () => {
    if (active && audio.paused && !audio.ended && !audio.error) pause();
  });
  audio.addEventListener("waiting", () => {
    if (active) {
      phase = "connecting";
      emit("Aguardando áudio do canal " + channelName + "…");
    }
  });
  function retryPlayback() {
    clearTimeout(retryTimer);
    if (!wanted || state !== "live") return;
    phase = "connecting";
    emit("Reconectando o áudio.");
    retryTimer = setTimeout(() => { if (wanted && state === "live") void start(); }, 3000);
  }
  function unavailable(message) {
    if (!channelId || !active) return;
    generation++;
    active = false;
    phase = "error";
    mediaState("none");
    emit(message);
    retryPlayback();
  }
  audio.addEventListener("ended", () =>
    unavailable(
      "A transmissão deste canal terminou. Toque na bandeira para tentar retomar.",
    ),
  );
  audio.addEventListener("error", () =>
    unavailable(
      "O áudio foi interrompido. Confira o Wi-Fi e toque na bandeira.",
    ),
  );
  if ("mediaSession" in navigator)
    for (const [action, handler] of Object.entries({
      play: () => void start(),
      pause,
      stop: pause,
    })) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* optional */
      }
    }
  window.translationPlayer = {
    selectChannel,
    activateChannel,
    updateState,
    pause,
    play: start,
    subscribe: (observer) => {
      observers.add(observer);
      return () => observers.delete(observer);
    },
  };
  window.addEventListener("pagehide", pause);
})();
