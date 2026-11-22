class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.samples = []; }
  process(inputs) {
    const data = inputs[0]?.[0];
    if (data) for (const sample of data) {
      this.samples.push(Math.round(Math.max(-1, Math.min(1, sample)) * 32767));
      if (this.samples.length === 1600) {
        const pcm = new ArrayBuffer(3200), view = new DataView(pcm);
        this.samples.forEach((value, index) => view.setInt16(index * 2, value, true));
        this.port.postMessage(pcm, [pcm]); this.samples = [];
      }
    }
    return true;
  }
}
registerProcessor('capture', Capture);
