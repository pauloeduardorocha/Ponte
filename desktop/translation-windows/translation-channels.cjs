const { languages, maxChannels } = require("./languages.js");
const { RadioStream } = require("./radio-stream.cjs");
class TranslationChannels {
  constructor({
    Bridge,
    log = () => {},
    onCatalogue = () => {},
    onMessage = () => {},
    onError = () => {},
    onCount = () => {},
  }) {
    this.Bridge = Bridge;
    this.log = log;
    this.onCatalogue = onCatalogue;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onCount = onCount;
    this.channels = new Map();
    this.running = false;
    this.key = "";
    this.add("en", false);
  }
  list() {
    return [...this.channels.values()].map(
      ({ id, name, nativeName, state }) => ({ id, name, nativeName, state }),
    );
  }
  get state() {
    return [...this.channels.values()].some((c) => c.state === "live")
      ? "live"
      : [...this.channels.values()].some((c) => c.state === "connecting")
        ? "connecting"
        : "idle";
  }
  get defaultId() {
    return this.channels.has("en")
      ? "en"
      : (this.channels.keys().next().value ?? null);
  }
  get listenerCount() {
    return [...this.channels.values()].reduce(
      (n, c) => n + c.radio.listenerCount,
      0,
    );
  }
  add(id, notify = true) {
    const language = languages.find((item) => item.id === id);
    if (!language) throw Error("Escolha um idioma disponível.");
    if (this.channels.has(id))
      throw Error("Este idioma já tem um canal aberto.");
    if (this.channels.size >= maxChannels)
      throw Error("É possível abrir no máximo 3 canais.");
    const channel = {
      ...language,
      state: "idle",
      transcript: "",
      radio: new RadioStream(this.onCount),
    };
    channel.bridge = new this.Bridge((message) => {
      if (
        this.channels.get(id) !== channel ||
        !this.running ||
        !["connecting", "live"].includes(channel.state)
      )
        return;
      if (message.error) {
        this.log('gemini.failure', { channel: id, reason: message.reason || 'unknown', code: message.code });
        if (message.retryable) {
          channel.state = "connecting";
          const delay = Math.min(30000, 1000 * 2 ** Math.min(channel.failures++, 5));
          this.log('gemini.retry', { channel: id, delay });
          clearTimeout(channel.retryTimer);
          channel.retryTimer = setTimeout(() => this.startChannel(channel, true), delay);
          this.onCatalogue();
          return;
        }
        channel.state = "error";
        channel.bridge.stop();
        channel.radio.stop();
        this.onError(channel, message.error);
        this.onCatalogue();
        return;
      }
      if (message.ready) {
        channel.state = "live";
        channel.failures = 0;
        this.log("gemini.ready", { channel: id });
        this.onCatalogue();
      }
      if (message.content && channel.state !== "live") return;
      const content = message.content;
      if (content?.outputTranscription?.text)
        channel.transcript = (
          channel.transcript + content.outputTranscription.text
        ).slice(-50000);
      if (content?.turnComplete)
        channel.transcript = (channel.transcript + "\n\n").slice(-50000);
      this.onMessage(channel, message);
    });
    this.channels.set(id, channel);
    if (notify) this.onCatalogue();
    if (this.running) this.startChannel(channel);
    return channel;
  }
  startChannel(channel, recovering = false) {
    this.log("gemini.connect", { channel: channel.id });
    channel.state = "connecting";
    if (!recovering) {
      channel.failures = 0;
      channel.transcript = "";
      this.onMessage(channel, { reset: true });
    }
    this.onCatalogue();
    try {
      channel.bridge.start(this.key, channel.id);
    } catch {
      channel.state = "error";
      channel.bridge.stop();
      this.onError(channel, "Não foi possível iniciar este canal.");
      this.onCatalogue();
    }
  }
  retry(id) {
    const channel = this.channels.get(id);
    if (!channel || !this.running || channel.state !== "error")
      throw Error("Este canal não está disponível para reconectar.");
    this.startChannel(channel);
  }
  remove(id) {
    const channel = this.channels.get(id);
    if (!channel) throw Error("Este canal já foi fechado.");
    this.channels.delete(id);
    clearTimeout(channel.retryTimer);
    channel.bridge.stop();
    channel.radio.stop();
    if (!this.channels.size) {
      this.running = false;
      this.key = "";
    }
    this.onCatalogue();
  }
  start(key) {
    if (!this.channels.size)
      throw Error("Abra pelo menos um canal antes de iniciar a tradução.");
    if (this.running) throw Error("A tradução já está em andamento.");
    this.running = true;
    this.key = key;
    for (const channel of this.channels.values()) this.startChannel(channel);
  }
  stop() {
    this.running = false;
    this.key = "";
    for (const channel of this.channels.values()) {
      clearTimeout(channel.retryTimer);
      channel.state = "idle";
      channel.bridge.stop();
      channel.radio.stop();
    }
    this.onCatalogue();
  }
  audio(bytes) {
    if (this.running)
      for (const channel of this.channels.values())
        if (channel.state === "live") channel.bridge.audio(bytes);
  }
  clear(id) {
    for (const channel of this.channels.values())
      if (!id || channel.id === id) {
        channel.transcript = "";
        channel.radio.clear();
        this.onMessage(channel, { reset: true });
      }
  }
}
module.exports = { TranslationChannels };
