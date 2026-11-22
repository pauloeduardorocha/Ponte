class TranslationPlayback {
  constructor() { this.playing = new Set(); this.nextTime = 0; }
  async enable() { this.context ||= new AudioContext(); await this.context.resume(); }
  clear() { for (const node of this.playing) { try { node.stop(); } catch {} } this.playing.clear(); this.nextTime = 0; }
  play(content) {
    if (content.interrupted) this.clear();
  }
  playPacket(packet) {
    if (!this.context || this.context.state !== 'running') return;
    const decoded = LocalAudioCodec.decode(packet);
    const buffer = this.context.createBuffer(1, decoded.samples.length, decoded.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = decoded.samples[i] / 32768;
    if (this.nextTime - this.context.currentTime > 3) this.clear();
    const node = this.context.createBufferSource(); node.buffer = buffer; node.connect(this.context.destination);
    this.nextTime = Math.max(this.context.currentTime + .03, this.nextTime);
    node.start(this.nextTime); this.nextTime += buffer.duration; this.playing.add(node); node.onended = () => this.playing.delete(node);
  }
}
