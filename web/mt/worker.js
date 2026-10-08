// The threaded run: a rayon pool of Web Workers sharing the module's memory, then the same proof
// as the single-threaded page, with time, peak wasm memory and the proof's SHA-256.
import init, { prove, initThreadPool } from './pkg/privacy_wasm.js';
const EXPECTED = 'a9c4db86d16637f1b18f2c7fb0d0eb3db23521a74560b7122d717b417552e6e5';
const say = (line) => postMessage({ line });
try {
  say(`mt ua: ${navigator.userAgent}; cores: ${navigator.hardwareConcurrency}; crossOriginIsolated: ${self.crossOriginIsolated}`);
  const wasm = await init();
  const threads = navigator.hardwareConcurrency;
  await initThreadPool(threads);
  const input = new Uint8Array(await (await fetch('../pair.json')).arrayBuffer());
  say(`mt loaded wasm, ${threads}-thread pool and ${input.length} input bytes; proving…`);
  const t0 = performance.now();
  const proof = prove(input);
  const seconds = ((performance.now() - t0) / 1000).toFixed(1);
  const digest = await crypto.subtle.digest('SHA-256', proof);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const gib = (wasm.memory.buffer.byteLength / 2 ** 30).toFixed(2);
  say(`mt done: ${threads} threads, time ${seconds} s, peak wasm memory ${gib} GiB, proof ${proof.length} bytes ${hash === EXPECTED ? 'IDENTICAL' : 'DIFFERENT ' + hash}`);
} catch (err) {
  say('mt failed: ' + (err && err.stack ? err.stack : err));
}
