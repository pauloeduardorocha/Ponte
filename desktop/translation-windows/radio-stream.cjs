const fs = require('node:fs');
const vm = require('node:vm');
let Encoder;
function mp3Encoder() {
  // The upstream complete bundle avoids the unresolved module globals in its CJS entry point.
  Encoder ||= vm.runInNewContext(fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8') + '; lamejs.Mp3Encoder;', { console });
  return new Encoder(1, 24000, 48);
}
class RadioStream {
  constructor(onCount = () => {}) { this.clients = new Set(); this.onCount = onCount; this.queue = []; this.queued = 0; }
  get listenerCount() { return this.clients.size; }
  subscribe(response) {
    if (!this.encoder) {
      this.encoder = mp3Encoder();
      this.startedAt = performance.now(); this.frames = 0;
      this.timer = setInterval(() => {
        const due = Math.floor((performance.now() - this.startedAt) / 40);
        // Catch up to the sample clock after timer jitter instead of slowly starving the player.
        for (let sent = 0; this.frames < due && sent < 5; sent++) { this.pulse(); this.frames++; }
      }, 20);
    }
    response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none', 'X-Content-Type-Options': 'nosniff', 'icy-name': 'Ponte - Live translation' });
    response.flushHeaders();
    this.clients.add(response); this.onCount();
    response.on('close', () => {
      this.clients.delete(response);
      if (!this.clients.size) this.reset();
      this.onCount();
    });
  }
  enqueue(pcm, sampleRate) {
    if (!this.clients.size || sampleRate !== 24000 || !pcm.length || pcm.length % 2) return;
    if (this.queued + pcm.length / 2 > 24000 * 15) { this.queue = []; this.queued = 0; }
    if (pcm.length / 2 > 24000 * 15) return;
    this.queue.push({ pcm: Buffer.from(pcm), offset: 0 }); this.queued += pcm.length / 2;
  }
  clear() { this.queue = []; this.queued = 0; }
  pulse() {
    if (!this.encoder) return;
    const samples = new Int16Array(960);
    for (let i = 0; i < samples.length && this.queue.length; i++) {
      const head = this.queue[0]; samples[i] = head.pcm.readInt16LE(head.offset); head.offset += 2; this.queued--;
      if (head.offset === head.pcm.length) this.queue.shift();
    }
    // Silence keeps the native media pipeline active between spoken phrases. No API requests are made.
    try {
      const encoded = this.encoder.encodeBuffer(samples);
      if (!encoded.length) return;
      const bytes = Buffer.from(encoded);
      for (const response of this.clients) {
        if (response.destroyed || response.writableLength > 64000) { response.destroy(); continue; }
        response.write(bytes);
      }
    } catch { this.stop(); }
  }
  reset() { clearInterval(this.timer); this.timer = null; this.encoder = null; this.clear(); }
  stop() {
    const clients = [...this.clients]; this.clients.clear(); this.reset();
    for (const response of clients) response.end();
    this.onCount();
  }
}
module.exports = { RadioStream };
