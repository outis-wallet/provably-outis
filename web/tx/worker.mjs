// Proves one Starknet transaction in this worker: state over JSON-RPC (/rpc), execution, virtual
// OS, the privacy prover and the sequencer's verifier, all in wasm.
import { buildOsInput, liveRpc } from "./tx-driver.mjs";

// `threads` > 0 loads the threaded build and starts a rayon pool of that many Web Workers.
self.onmessage = async ({ data: { threads = 0, trace = false } = {} }) => {
  const log = (message) => self.postMessage({ log: message });
  const seconds = (from) => ((performance.now() - from) / 1000).toFixed(1);
  try {
    const started = performance.now();
    const pkg = await import(threads ? "./pkg-mt/os_wasm_probe.js" : "./pkg/os_wasm_probe.js");
    const { TxSession, verify_prove_result } = pkg;
    const wasm = await pkg.default();
    if (trace) pkg.init_logging("info");
    if (threads) await pkg.initThreadPool(threads);
    log(`wasm loaded, ${threads ? threads + " threads" : "1 thread"}, cross-origin isolated: ${self.crossOriginIsolated}`);
    const memoryGiB = () => (wasm.memory.buffer.byteLength / 2 ** 30).toFixed(2);
    const transaction = await (await fetch("./tx.json")).json();
    let calls = 0;
    const rpc = liveRpc("/rpc", () => calls++);
    const { session } = await buildOsInput({ TxSession, rpc, chainId: "SN_SEPOLIA", transaction, log });
    const inputSeconds = seconds(started);
    log(`input built in ${inputSeconds} s (${calls} RPC calls)`);
    let phase = performance.now();
    log("running the virtual OS");
    const pie = session.run_os();
    const osSeconds = seconds(phase);
    log(`virtual OS in ${osSeconds} s: ${pie}`);
    phase = performance.now();
    log("proving");
    const resultJson = session.prove();
    const proveSeconds = seconds(phase);
    const result = JSON.parse(resultJson);
    log(`proved in ${proveSeconds} s, wasm memory ${memoryGiB()} GiB (${pkg.memory_report()} MiB)`);
    phase = performance.now();
    verify_prove_result(resultJson);
    const verifySeconds = seconds(phase);
    log(`proof VERIFIED in ${verifySeconds} s`);
    self.postMessage({ proof_result: resultJson });
    self.postMessage({
      done: {
        threads: threads || 1,
        block: Number(session.block_number()),
        tx_hash: session.tx_hash(),
        calls,
        input_s: inputSeconds,
        os_s: osSeconds,
        prove_s: proveSeconds,
        verify_s: verifySeconds,
        total_s: seconds(started),
        wasm_memory_gib: memoryGiB(),
        proof_bytes: Math.floor((result.proof.length * 3) / 4),
        proof_version: result.proof_facts[0],
        verified: true,
      },
    });
  } catch (error) {
    self.postMessage({ error: String(error && error.stack ? error.stack : error) });
  }
};
