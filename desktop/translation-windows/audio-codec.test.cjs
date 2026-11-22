const test = require('node:test');
const assert = require('node:assert/strict');
const codec = require('./audio-codec.js');
function pcm(samples) {
  const data = new Uint8Array(samples.length * 2), view = new DataView(data.buffer);
  samples.forEach((value, index) => view.setInt16(index * 2, value, true)); return data;
}
test('IMA ADPCM decoder matches a reference nibble sequence', () => {
  const packet = new Uint8Array(20), view = new DataView(packet.buffer);
  packet.set([76,84,65,49]); view.setUint32(4,24000,true); view.setUint32(8,9,true);
  packet.set([0x77,0x77,0x77,0x77],16);
  assert.deepEqual([...codec.decode(packet).samples], [0,11,41,104,240,533,1164,2521,5431]);
});
test('speech-band waveform retains timing, signal quality and at least 74% PCM savings', () => {
  const signal = Array.from({length:24000}, (_, i) => Math.round(11000*Math.sin(2*Math.PI*230*i/24000) + 3000*Math.sin(2*Math.PI*710*i/24000)));
  const input = pcm(signal), packet = codec.encode(input), decoded = codec.decode(packet);
  assert.equal(decoded.sampleRate,24000); assert.equal(decoded.samples.length,signal.length);
  let energy=0,error=0;
  signal.forEach((value,index)=>{energy+=value*value;error+=(value-decoded.samples[index])**2;});
  const snr=10*Math.log10(energy/error);
  assert.ok(snr>25, `SNR ${snr.toFixed(1)} dB`);
  assert.ok(packet.length/input.length<0.26);
  console.log(`Audio: ${input.length} PCM bytes -> ${packet.length} ADPCM bytes; SNR ${snr.toFixed(1)} dB`);
});
test('silence, odd sample counts, independent packets and clipping are handled', () => {
  for (const signal of [[0],[0,0,0,0,0],[32767,-32768,32767,-32768,0],[-1000,-900,-800,-700]]) {
    const encoded=codec.encode(pcm(signal)), result=codec.decode(encoded);
    assert.equal(result.samples.length,signal.length); assert.equal(result.samples[0],signal[0]);
    assert.ok([...result.samples].every(value=>value>=-32768 && value<=32767));
    assert.deepEqual(codec.decode(encoded).samples,result.samples);
  }
});
test('invalid headers, truncation and malformed PCM are rejected', () => {
  assert.throws(()=>codec.encode(new Uint8Array(3)));
  const valid=codec.encode(pcm([1,2,3,4]));
  assert.throws(()=>codec.decode(valid.subarray(0,valid.length-1)));
  for (const [offset,value] of [[0,0],[14,89],[15,1]]) {const bad=valid.slice();bad[offset]=value;assert.throws(()=>codec.decode(bad));}
  const bad=valid.slice();new DataView(bad.buffer).setUint32(8,0xffffffff,true);assert.throws(()=>codec.decode(bad));
});
