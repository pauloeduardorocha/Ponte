/* global module */
// Independent IMA ADPCM blocks: little-endian header followed by low-nibble-first samples.
// Each packet carries its own predictor/index, so late joins and reconnects need no history.
(() => {
  const steps = [7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
  const indices = [-1,-1,-1,-1,2,4,6,8];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function advance(state, code) {
    const step = steps[state.index];
    let delta = step >> 3;
    if (code & 4) delta += step;
    if (code & 2) delta += step >> 1;
    if (code & 1) delta += step >> 2;
    state.predictor = clamp(state.predictor + (code & 8 ? -delta : delta), -32768, 32767);
    state.index = clamp(state.index + indices[code & 7], 0, 88);
    return state.predictor;
  }
  function encode(pcm, sampleRate = 24000) {
    if (!(pcm instanceof Uint8Array) || pcm.byteLength < 2 || pcm.byteLength % 2 || pcm.byteLength > 480000 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new Error('Invalid PCM audio');
    const input = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), count = pcm.byteLength / 2;
    const packet = new Uint8Array(16 + Math.ceil((count - 1) / 2));
    const header = new DataView(packet.buffer);
    packet.set([76,84,65,49]); // LTA1
    header.setUint32(4, sampleRate, true); header.setUint32(8, count, true);
    const state = { predictor: input.getInt16(0, true), index: 0 };
    if (count > 1) {
      const initialDelta = Math.abs(input.getInt16(2, true) - state.predictor);
      while (state.index < 88 && steps[state.index] < initialDelta) state.index++;
    }
    header.setInt16(12, state.predictor, true); packet[14] = state.index;
    for (let i = 1; i < count; i++) {
      let difference = input.getInt16(i * 2, true) - state.predictor;
      let code = difference < 0 ? 8 : 0;
      difference = Math.abs(difference);
      const step = steps[state.index];
      if (difference >= step) { code |= 4; difference -= step; }
      if (difference >= (step >> 1)) { code |= 2; difference -= step >> 1; }
      if (difference >= (step >> 2)) code |= 1;
      advance(state, code);
      packet[16 + ((i - 1) >> 1)] |= code << (((i - 1) & 1) * 4);
    }
    return packet;
  }
  function decode(packet) {
    if (!(packet instanceof Uint8Array) || packet.byteLength < 16) throw new Error('Invalid ADPCM packet');
    const header = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const sampleRate = header.getUint32(4, true), count = header.getUint32(8, true);
    if (header.getUint32(0, false) !== 0x4c544131 || count < 1 || count > 240000 || sampleRate < 8000 || sampleRate > 48000 || packet[14] > 88 || packet[15] !== 0 || packet.length !== 16 + Math.ceil((count - 1) / 2)) throw new Error('Invalid ADPCM header');
    const state = { predictor: header.getInt16(12, true), index: packet[14] }, samples = new Int16Array(count);
    samples[0] = state.predictor;
    for (let i = 1; i < count; i++) samples[i] = advance(state, (packet[16 + ((i - 1) >> 1)] >> (((i - 1) & 1) * 4)) & 15);
    return { samples, sampleRate };
  }
  const codec = { encode, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = codec;
  else globalThis.LocalAudioCodec = codec;
})();
