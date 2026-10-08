// Proves one Starknet transaction in this worker: state over JSON-RPC (/rpc), execution, virtual
// OS, the privacy prover and the sequencer's verifier, all in wasm.
import { buildOsInput, compareWithNative, liveRpc, replayRpc } from "./tx-driver.mjs";

// `replay` serves the RPC calls from the capture (capture/ links to captures/capture2) instead of
// the node, proves its transaction and compares the proof with the native prover's response.
const CAPTURE = "./capture/";
const REQUEST = "request-173903.json";
const RESPONSE = "response-173903.json";

const fetchOk = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
};
const fetchJson = async (url) => (await fetchOk(url)).json();

// `threads` > 0 loads the threaded build and starts a rayon pool of that many Web Workers.
self.onmessage = async ({ data: { threads = 0, trace = false, replay = false } = {} }) => {
  const log = (message) => self.postMessage({ log: message });
  const seconds = (from) => ((performance.now() - from) / 1000).toFixed(1);
  try {
    const started = performance.now();
    const pkg = await import(threads ? "./pkg-mt/os_wasm_probe.js" : "./pkg/os_wasm_probe.js");
    const { TxSession, verify_prove_result } = pkg;
    const wasm = await pkg.default();
    if (trace) pkg.init_logging("info");
    if (threads) await pkg.initThreadPool(threads);
    log(`wasm loaded in ${seconds(started)} s, ${threads ? threads + " threads" : "1 thread"}, cross-origin isolated: ${self.crossOriginIsolated}`);
    const memoryGiB = () => (wasm.memory.buffer.byteLength / 2 ** 30).toFixed(2);
    let calls = 0;
    let rpc, transaction;
    if (replay) {
      const recorded = (await (await fetchOk(CAPTURE + "rpc-log.jsonl")).text()).trim().split("\n").map((line) => JSON.parse(line));
      const loadCasm = async (classHash) => (await fetchJson(`${CAPTURE}casm-${classHash}.json`)).result;
      rpc = replayRpc(recorded, loadCasm, () => calls++);
      transaction = (await fetchJson(CAPTURE + REQUEST)).params.transaction;
      log(`replaying the capture (${recorded.length} recorded calls)`);
    } else {
      rpc = liveRpc("/rpc", () => calls++);
      transaction = await fetchJson("./tx.json");
    }
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
    let identical;
    if (replay) {
      const { identical: same, facts, messages } = compareWithNative(result, (await fetchJson(CAPTURE + RESPONSE)).result);
      identical = same && facts && messages;
      log(`proof ${same ? "IDENTICAL" : "DIFFERENT"} to the native proof; proof_facts ${facts ? "match" : "DIFFER"}; l2_to_l1_messages ${messages ? "match" : "DIFFER"}`);
    }
    self.postMessage({ proof_result: resultJson });
    self.postMessage({
      done: {
        mode: replay ? "replay" : "live",
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
        ...(replay && { identical }),
      },
    });
  } catch (error) {
    self.postMessage({ error: String(error && error.stack ? error.stack : error) });
  }
};
