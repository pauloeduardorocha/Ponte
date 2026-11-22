const $ = (id) => document.getElementById(id);
let context,
  stream,
  capture,
  source,
  nextTime = 0,
  generation = 0,
  active = false,
  audioWired = false,
  microphoneLost = false,
  replacingMicrophone = false,
  connected = false;
let published = false,
  publishing = false,
  translationReady = false,
  channels = [],
  monitorId = null,
  audienceUrl = null;
const slots = [null, null, null],
  draftLanguages = ["en", "es", "fr"],
  channelTexts = new Map(),
  playing = new Set();
const states = {
  idle: "Pronto",
  connecting: "Conectando…",
  live: "Ao vivo",
  error: "Falha de conexão",
};
function silence() {
  for (const node of playing) {
    try {
      node.stop();
    } catch {}
  }
  playing.clear();
  nextTime = 0;
}
function button(text, handler, label) {
  const element = document.createElement("button");
  element.textContent = text;
  element.onclick = handler;
  if (label) element.setAttribute("aria-label", label);
  return element;
}
function renderActions() {
  translationReady = channels.some((channel) => channel.state === "live");
  $("start").textContent = !active
    ? "Iniciar tradução e publicar"
    : publishing
      ? "Publicando…"
      : published
        ? "Tradução publicada"
        : translationReady
          ? "Tentar publicar"
          : "Conectando canais…";
  $("start").disabled =
    !connected ||
    !channels.length ||
    publishing ||
    (active && (published || !translationReady));
  $("stop").disabled = !active;
  $("microphone").disabled = replacingMicrophone || (active && !microphoneLost);
  $("refresh").disabled = $("microphone").disabled;
  $("refresh").textContent = microphoneLost ? "Usar este microfone" : "Atualizar microfones";
  $("key").disabled = active;
  $("ponte-config").disabled = active;
}
function renderChannels() {
  $("channel-count").textContent = channels.length + " de 3 abertos";
  for (let i = 0; i < slots.length; i++)
    if (slots[i] && !channels.some((channel) => channel.id === slots[i]))
      slots[i] = null;
  for (const channel of channels)
    if (!slots.includes(channel.id)) slots[slots.indexOf(null)] = channel.id;
  if (monitorId && !channels.some((channel) => channel.id === monitorId)) {
    monitorId = null;
    window.translator.monitor(null);
    silence();
  }
  const scroll = new Map(
    [...document.querySelectorAll(".channel-text")].map((element) => [
      element.dataset.channelId,
      element.scrollTop,
    ]),
  );
  $("channel-list").replaceChildren();
  for (let slot = 0; slot < 3; slot++) {
    const channel = channels.find((item) => item.id === slots[slot]),
      panel = document.createElement("article");
    panel.className = "channel-panel" + (channel ? "" : " is-inactive");
    panel.setAttribute("role", "listitem");
    panel.dataset.slot = slot;
    const heading = document.createElement("div");
    heading.className = "heading";
    const title = document.createElement("h3");
    title.textContent = channel ? channel.name : "Canal " + (slot + 1);
    const badge = document.createElement("span");
    badge.className = "channel-badge";
    badge.textContent = channel ? states[channel.state] : "Inativo";
    heading.append(title, badge);
    panel.append(heading);
    if (!channel) {
      const note = document.createElement("p");
      note.textContent = "Escolha um idioma para abrir este canal.";
      const label = document.createElement("label");
      label.htmlFor = "slot-language-" + slot;
      label.textContent = "Idioma de saída";
      const select = document.createElement("select");
      select.id = label.htmlFor;
      for (const language of window.TranslationLanguages.languages)
        if (!channels.some((item) => item.id === language.id))
          select.add(new Option(language.name, language.id));
      if (
        [...select.options].some(
          (option) => option.value === draftLanguages[slot],
        )
      )
        select.value = draftLanguages[slot];
      draftLanguages[slot] = select.value;
      select.onchange = () => {
        draftLanguages[slot] = select.value;
      };
      const open = button(
        "Abrir canal",
        () => {
          $("channel-notice").textContent = "";
          window.translator.openChannel(select.value);
        },
        "Abrir canal " + (slot + 1),
      );
      open.disabled = !connected;
      panel.append(note, label, select, open);
    } else {
      const actions = document.createElement("div");
      actions.className = "channel-actions";
      const monitor = button(
        monitorId === channel.id ? "Silenciar neste PC" : "Ouvir neste PC",
        () => {
          silence();
          monitorId = monitorId === channel.id ? null : channel.id;
          window.translator.monitor(monitorId);
          renderChannels();
        },
        "Ouvir canal " + channel.name + " neste computador",
      );
      monitor.setAttribute("aria-pressed", String(monitorId === channel.id));
      monitor.disabled = !active || channel.state !== "live";
      actions.append(monitor);
      actions.append(
        button(
          "Fechar",
          () => window.translator.closeChannel(channel.id),
          "Fechar canal " + channel.name,
        ),
      );
      panel.append(actions);
      if (channel.state === "error" && active)
        panel.append(
          button(
            "Reconectar",
            () => window.translator.retryChannel(channel.id),
            "Reconectar canal " + channel.name,
          ),
        );
      const text = document.createElement("div");
      text.id = "text-" + channel.id;
      text.className = "channel-text";
      text.dataset.channelId = channel.id;
      text.dir = "auto";
      text.setAttribute("role", "log");
      text.setAttribute("aria-live", "polite");
      text.setAttribute("aria-label", "Texto do canal " + channel.name);
      text.textContent = channelTexts.get(channel.id) || "";
      panel.append(text);
      panel.append(
        button(
          "Limpar texto",
          () => window.translator.clear(channel.id),
          "Limpar texto do canal " + channel.name,
        ),
      );
    }
    $("channel-list").append(panel);
    if (channel)
      $("text-" + channel.id).scrollTop = scroll.get(channel.id) || 0;
  }
  renderActions();
}
function updateText(id) {
  const element = $("text-" + id);
  if (!element) return;
  const follow =
    element.scrollHeight - element.scrollTop - element.clientHeight < 60;
  element.textContent = channelTexts.get(id) || "";
  if (follow) element.scrollTop = element.scrollHeight;
}
function showAudienceUrl(value) {
  audienceUrl = value || null;
  $("audience-link").hidden = !value;
  $("qr-panel").hidden = !value;
  $("copy-link").disabled = !value;
  if (!value) {
    $("link-status").textContent =
      "Conecte o computador à rede da igreja para disponibilizar o acesso direto.";
    $("audience-qr").removeAttribute("src");
    return;
  }
  const url = new URL(value);
  $("audience-link").href = value;
  $("audience-link").textContent = value;
  $("audience-qr").src =
    url.pathname.replace("/listen/", "/qr/") +
    ".svg?v=" +
    encodeURIComponent(value);
  $("link-status").textContent =
    "Link e QR code abrem a mesma página de canais.";
}
$("copy-link").onclick = async () => {
  if (!audienceUrl) return;
  try {
    await navigator.clipboard.writeText(audienceUrl);
    $("link-status").textContent = "Link copiado.";
  } catch {
    $("link-status").textContent = "Selecione e copie o link acima.";
  }
};
function stop(message = "Transmissão parada") {
  generation++;
  microphoneLost = false;
  replacingMicrophone = false;
  $("microphone-notice").hidden = true;
  active = false;
  audioWired = false;
  published = false;
  monitorId = null;
  window.translator.monitor(null);
  window.translator.stop();
  capture?.disconnect();
  source?.disconnect();
  stream?.getTracks().forEach((track) => track.stop());
  silence();
  void context?.close().catch(() => {});
  context = stream = capture = source = null;
  $("status").textContent = message;
  renderChannels();
}
async function microphones() {
  const devices = await navigator.mediaDevices.enumerateDevices(),
    selected = $("microphone").value;
  $("microphone").replaceChildren(new Option("Padrão do sistema", ""));
  for (const device of devices.filter((item) => item.kind === "audioinput"))
    $("microphone").add(
      new Option(
        device.label || "Microfone " + $("microphone").length,
        device.deviceId,
      ),
    );
  if ([...$("microphone").options].some((option) => option.value === selected))
    $("microphone").value = selected;
}
function acquireMicrophone() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
        deviceId: $("microphone").value
          ? { exact: $("microphone").value }
          : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
}
function lostMicrophone(input) {
  if (!active || stream !== input || microphoneLost) return;
  microphoneLost = true;
  window.translator.microphone(true);
  $("microphone-notice").textContent = "Microfone desconectado. Escolha outro dispositivo e clique em Usar este microfone. Os canais continuam abertos.";
  $("microphone-notice").hidden = false;
  renderActions();
  $("microphone").focus();
  void microphones().catch(() => {});
}
function watchMicrophone(input) {
  const track = input.getAudioTracks()[0];
  track.addEventListener("ended", () => lostMicrophone(input), { once: true });
  if (track.readyState === "ended") lostMicrophone(input);
}
navigator.mediaDevices.addEventListener("devicechange", async () => {
  const input = stream;
  if (!active || !input) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const id = input.getAudioTracks()[0]?.getSettings().deviceId;
    if (id && !devices.some(d => d.kind === "audioinput" && d.deviceId === id)) lostMicrophone(input);
    if (microphoneLost) await microphones();
  } catch { /* The track also signals loss through ended. */ }
});
async function replaceMicrophone() {
  const token = generation;
  let input;
  replacingMicrophone = true;
  renderActions();
  try {
    input = await acquireMicrophone();
    if (generation !== token) return;
    const next = context.createMediaStreamSource(input);
    if (audioWired) next.connect(capture);
    source?.disconnect();
    stream?.getTracks().forEach(track => track.stop());
    source = next;
    stream = input;
    input = null;
    microphoneLost = false;
    window.translator.microphone(false);
    $("microphone-notice").hidden = true;
    watchMicrophone(stream);
  } catch {
    if (generation === token)
      $("microphone-notice").textContent = "Não foi possível usar este microfone. Escolha outro e tente novamente.";
  } finally {
    input?.getTracks().forEach(track => track.stop());
    if (generation === token) {
      replacingMicrophone = false;
      renderActions();
    }
  }
}
$("refresh").onclick = async () => {
  if (microphoneLost) return replaceMicrophone();
  try {
    const permission = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    permission.getTracks().forEach((track) => track.stop());
    await microphones();
  } catch {
    $("status").textContent =
      "Não foi possível acessar os microfones. Verifique a permissão no Windows.";
  }
};
$("start").onclick = async () => {
  if (active) {
    window.translator.publishService();
    return;
  }
  if (!channels.length) {
    $("status").textContent = "Abra pelo menos um canal antes de iniciar.";
    return;
  }
  const key = $("key").value.trim(),
    configuration = $("ponte-config").value.trim();
  if (!key) {
    $("status").textContent = "Informe sua chave Gemini API.";
    $("key").focus();
    return;
  }
  if (!configuration) {
    $("status").textContent = "Cole a ligação gerada pelo administrador.";
    $("ponte-config").focus();
    return;
  }
  channelTexts.clear();
  const token = ++generation;
  active = true;
  published = false;
  renderChannels();
  $("status").textContent = "Preparando microfone e canais…";
  try {
    const acquired = await acquireMicrophone();
    if (token !== generation) {
      acquired.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = acquired;
    context = new AudioContext({ sampleRate: 16000 });
    await context.resume();
    if (token !== generation) return;
    if (context.sampleRate !== 16000)
      throw Error(
        "O dispositivo não suporta captura a 16 kHz. Selecione outro microfone.",
      );
    await context.audioWorklet.addModule("/capture.js");
    if (token !== generation) return;
    source = context.createMediaStreamSource(stream);
    capture = new AudioWorkletNode(context, "capture");
    watchMicrophone(stream);
    capture.port.onmessage = (event) => {
      if (active && token === generation)
        window.translator.audio(new Uint8Array(event.data));
    };
    await window.translator.startService(key, configuration);
  } catch (error) {
    if (token === generation) stop(error.message);
  }
};
$("stop").onclick = () => stop();
window.translator.listen((message) => {
  if (message.reconnecting) {
    connected = false;
    publishing = false;
    $("status").textContent = "Reconectando ao servidor local.";
    renderActions();
    return;
  }
  if (message.authenticated) {
    connected = true;
    $("status").textContent = "Pronto para iniciar";
  }
  if (Object.hasOwn(message, "audienceUrl"))
    showAudienceUrl(message.audienceUrl);
  if (message.channels) {
    channels = message.channels;
    for (const id of channelTexts.keys())
      if (!channels.some((channel) => channel.id === id))
        channelTexts.delete(id);
    if (active && message.running === false)
      stop(message.authenticated ? "Sessão encerrada. Inicie a tradução novamente." : "Nenhum canal aberto. Abra um canal para iniciar.");
    renderChannels();
    if (active)
      $("status").textContent = translationReady
        ? "Traduzindo · " +
          channels.filter((channel) => channel.state === "live").length +
          " canal(is) ao vivo"
        : "Conectando canais…";
  }
  if (message.channelError)
    $("channel-notice").textContent = message.channelError;
  if (message.serviceError) {
    stop(message.serviceError);
    $("publication-status").textContent =
      "A transmissão não foi publicada. Confira as chaves e tente novamente.";
  }
  if (message.viewers !== undefined)
    $("viewers").textContent =
      message.viewers + " ouvinte" + (message.viewers === 1 ? "" : "s");
  if (message.publication) {
    const publication = message.publication;
    if (publication.published !== undefined) published = publication.published;
    if (publication.publishing !== undefined)
      publishing = publication.publishing;
    if (publication.error)
      $("publication-status").textContent = publication.error;
    else if (published)
      $("publication-status").textContent =
        "Publicada no Ponte. Os ouvintes podem entrar pelo Ponte ou pelo link e QR code abaixo.";
    else if (publishing)
      $("publication-status").textContent = "Publicando a tradução no Ponte…";
    else if (!active)
      $("publication-status").textContent =
        "A publicação será feita ao iniciar a tradução.";
    renderActions();
  }
  if (message.reset && message.channelId) {
    channelTexts.set(message.channelId, "");
    updateText(message.channelId);
    if (monitorId === message.channelId) silence();
  }
  if (message.content) {
    const content = message.content;
    const addition =
      (content.outputTranscription?.text || "") +
      (content.turnComplete ? "\n\n" : "");
    if (addition) {
      channelTexts.set(
        message.channelId,
        ((channelTexts.get(message.channelId) || "") + addition).slice(-50000),
      );
      updateText(message.channelId);
    }
  }
  if (message.error) {
    connected = false;
    stop(message.error);
    return;
  }
  if (!active) return;
  if ((message.ready || (message.authenticated && translationReady)) && source && capture && !audioWired) {
    source.connect(capture);
    capture.connect(context.destination);
    audioWired = true;
  }
  const content = message.content;
  if (!content || message.channelId !== monitorId || !context) return;
  if (content.interrupted) silence();
  for (const part of content.modelTurn?.parts || []) {
    if (!part.inlineData?.data) continue;
    const bytes = Uint8Array.from(atob(part.inlineData.data), (char) =>
        char.charCodeAt(0),
      ),
      view = new DataView(bytes.buffer),
      rate = Number(
        /rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] || 24000,
      ),
      buffer = context.createBuffer(1, Math.floor(bytes.length / 2), rate),
      samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    nextTime = Math.max(context.currentTime + 0.03, nextTime);
    if (nextTime - context.currentTime > 3) silence();
    node.start(Math.max(context.currentTime + 0.03, nextTime));
    nextTime = Math.max(context.currentTime + 0.03, nextTime) + buffer.duration;
    playing.add(node);
    node.onended = () => playing.delete(node);
  }
});
window.addEventListener("beforeunload", () => stop());
renderChannels();
microphones().catch(() => {});
