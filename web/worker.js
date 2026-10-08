// Proves the prepared statement with the wasm prover and reports time, peak wasm memory and the
// proof's SHA-256 against the expected (uncompressed) frontier proof.
import init, { prove } from './pkg/privacy_wasm.js';
const EXPECTED = 'a9c4db86d16637f1b18f2c7fb0d0eb3db23521a74560b7122d717b417552e6e5';
const say = (line) => postMessage({ line });
try {
  say(`ua: ${navigator.userAgent}; cores: ${navigator.hardwareConcurrency}`);
  const wasm = await init();
  const input = new Uint8Array(await (await fetch('pair.json')).arrayBuffer());
  say(`loaded wasm and ${input.length} input bytes; proving (single thread)…`);
  const t0 = performance.now();
  const proof = prove(input);
  const seconds = ((performance.now() - t0) / 1000).toFixed(1);
  const digest = await crypto.subtle.digest('SHA-256', proof);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const gib = (wasm.memory.buffer.byteLength / 2 ** 30).toFixed(2);
  say(`done: time ${seconds} s, peak wasm memory ${gib} GiB, proof ${proof.length} bytes ${hash === EXPECTED ? 'IDENTICAL' : 'DIFFERENT ' + hash}`);
} catch (err) {
  say('failed: ' + (err && err.stack ? err.stack : err));
}
