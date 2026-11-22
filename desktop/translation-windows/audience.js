(() => {
  const text = document.getElementById("text"),
    status = document.getElementById("status"),
    grid = document.getElementById("listener-channel"),
    notice = document.getElementById("channel-notice");
  let connection,
    retry,
    connectTimeout,
    watchdog,
    lastResponse,
    closed = false,
    channels = [],
    selected = null,
    initialized = false,
    playback = { channelId: null, active: false, phase: "idle" };
  function syncPlayback() {
    for (const tile of grid.children) {
      const channel = channels.find(
        (item) => item.id === tile.dataset.channelId,
      );
      if (!channel) continue;
      const current = playback.channelId === channel.id;
      tile.dataset.playback = current ? playback.phase : "idle";
      tile.setAttribute("aria-pressed", String(channel.id === selected));
      const label =
        (current && playback.wanted ? "Pausar " : "Ouvir ") +
        channel.nativeName;
      tile.setAttribute("aria-label", label);
      tile.title = label;
    }
  }
  window.translationPlayer.subscribe((value) => {
    playback = value;
    syncPlayback();
  });
  function showText() {
    text.hidden = !text.textContent.trim();
  }
  function choose(id, notify = true) {
    const channel = channels.find((item) => item.id === id),
      next = channel?.id ?? null,
      changed = next !== selected;
    selected = next;
    grid.dataset.selectedChannel = selected || "";
    if (changed) {
      text.replaceChildren();
      showText();
    }
    if (notify && channel)
      window.translationPlayer.activateChannel(
        selected,
        channel.nativeName,
        channel.state,
      );
    else
      window.translationPlayer.selectChannel(
        selected,
        channel?.nativeName,
        channel?.state,
      );
    renderCards();
    if (
      notify &&
      changed &&
      selected &&
      connection?.readyState === WebSocket.OPEN
    )
      connection.send(
        JSON.stringify({ action: "select-channel", channelId: selected }),
      );
  }
  function renderCards() {
    const focused = document.activeElement?.dataset.channelId;
    grid.dataset.count = channels.length;
    grid.dataset.selectedChannel = selected || "";
    grid.replaceChildren();
    for (const channel of channels) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "listener-channel-tile";
      tile.dataset.channelId = channel.id;
      const flag = window.TranslationFlags[channel.id];
      if (flag) {
        const img = document.createElement("img");
        img.src = "/flags/" + flag + ".svg";
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.className = "language-flag";
        tile.append(img);
      } else {
        const icon = document.createElement("span");
        icon.textContent = "🌐";
        icon.setAttribute("aria-hidden", "true");
        tile.append(icon);
      }
      tile.onclick = () => {
        notice.textContent = "";
        choose(channel.id);
      };
      grid.append(tile);
    }
    syncPlayback();
    if (focused)
      [...grid.children]
        .find((tile) => tile.dataset.channelId === focused)
        ?.focus({ preventScroll: true });
  }
  function catalogue(list) {
    document.getElementById("broadcast-notice").hidden = list.some(
      (channel) => channel.state === "live",
    );
    channels = list;
    if (selected && !list.some((channel) => channel.id === selected)) {
      choose(null, false);
      notice.textContent =
        "O canal que você ouvia foi fechado. Escolha outro canal aberto.";
    } else {
      const current = channels.find((channel) => channel.id === selected);
      if (current) window.translationPlayer.updateState(current.state);
      renderCards();
    }
  }
  function connect() {
    clearTimeout(retry);
    const room = location.pathname.split("/").pop();
    connection = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/audience-ws/${room}`,
    );
    connectTimeout = setTimeout(() => {
      document.getElementById("reconnect-portal").hidden = false;
      connection.close();
    }, 8000);
    connection.onopen = () => {
      clearTimeout(connectTimeout);
      lastResponse = Date.now();
      watchdog = setInterval(() => {
        if (Date.now() - lastResponse > 45000) {
          document.getElementById("reconnect-portal").hidden = false;
          connection.close();
        }
      }, 15000);
      document.getElementById("reconnect-portal").hidden = true;
    };
    connection.onmessage = (event) => {
      lastResponse = Date.now();
      if (typeof event.data !== "string") return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.channels) catalogue(message.channels);
      if (!initialized && message.channels) {
        initialized = true;
        renderCards();
      }
      if (message.selectionError) {
        notice.textContent = message.selectionError;
        return;
      }
      if (message.channelClosed) {
        choose(null, false);
        notice.textContent =
          "O canal que você ouvia foi fechado. Escolha outro canal aberto.";
      }
      if (
        Object.hasOwn(message, "selectedChannel") &&
        message.selectedChannel !== selected
      ) {
        if (selected && channels.some((channel) => channel.id === selected)) {
          connection.send(
            JSON.stringify({ action: "select-channel", channelId: selected }),
          );
          return;
        }
      }
      if (message.channelId !== selected || !selected) return;
      if (message.state) {
        status.textContent = message.state;
        window.translationPlayer.updateState(message.state);
      }
      if (message.reset) text.replaceChildren();
      if (typeof message.snapshot === "string")
        text.textContent = message.snapshot;
      const content = message.content;
      if (content) {
        const follow =
          text.scrollHeight - text.scrollTop - text.clientHeight < 60;
        if (content.outputTranscription?.text)
          text.append(
            document.createTextNode(content.outputTranscription.text),
          );
        if (content.turnComplete) text.append(document.createTextNode("\n\n"));
        if (text.textContent.length > 50000)
          text.textContent = text.textContent.slice(-50000);
        if (follow) text.scrollTop = text.scrollHeight;
      }
      showText();
    };
    connection.onclose = () => {
      clearInterval(watchdog);
      clearTimeout(connectTimeout);
      document.getElementById("reconnect-portal").hidden = false;
      status.textContent = "Texto desconectado. Reconectando…";
      if (!closed) retry = setTimeout(connect, 2500);
    };
    connection.onerror = () => connection.close();
  }
  window.addEventListener("pagehide", () => {
    closed = true;
    clearTimeout(connectTimeout);
    clearTimeout(retry);
    connection?.close();
  });
  window.addEventListener("pageshow", () => {
    if (closed) {
      closed = false;
      connect();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (
      !document.hidden &&
      !closed &&
      connection?.readyState === WebSocket.CLOSED
    )
      connect();
  });
  connect();
})();
