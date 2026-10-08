// Runs the wasm pipeline on a recording made by rpc-record-proxy.py and writes the virtual OS
// input next to the native dump of the same run.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildOsInput } from "./tx-driver.mjs";

const require = createRequire(import.meta.url);
const probe = require("./os-node/os_wasm_probe.js");
const { TxSession } = probe;
if (process.argv.includes("--trace")) probe.init_logging("info");
const memory = (stage) => console.log(`MEM ${stage}: ${probe.memory_report()}`);

const capture = process.argv[2];
// Outputs go to OUT (the capture itself is kept read-only).
const out = process.env.OUT ?? path.join(capture, "..", "replay-out");
fs.mkdirSync(out, { recursive: true });
const recorded = fs.readFileSync(path.join(capture, "rpc-log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const transaction = JSON.parse(fs.readFileSync(path.join(capture, fs.readdirSync(capture).find((f) => f.startsWith("request-"))))).params.transaction;

const same = (a, b) => BigInt(a) === BigInt(b);
const served = [];
async function rpc(method, params) {
  served.push(method);
  if (method === "starknet_getCompiledCasm") {
    return JSON.parse(fs.readFileSync(path.join(capture, `casm-${params.class_hash}.json`))).result;
  }
  const match = recorded.find(({ request }) => {
    if (request.method !== method) return false;
    const p = request.params;
    if (method === "starknet_getStorageAt") return same(p.contract_address, params.contract_address) && same(p.key, params.key);
    if (method === "starknet_getNonce" || method === "starknet_getClassHashAt") return same(p.contract_address, params.contract_address);
    if (method === "starknet_getClass") return same(p.class_hash, params.class_hash);
    return true;
  });
  if (!match) throw new Error(`not in the recording: ${method} ${JSON.stringify(params)}`);
  if (method === "starknet_getStorageProof") compareProofParams(match.request.params, params);
  if (match.response.error) throw Object.assign(new Error(match.response.error.message), match.response.error);
  return match.response.result;
}

function compareProofParams(recordedParams, ours) {
  const norm = (p) => JSON.stringify({
    block: p.block_id.block_number,
    classes: p.class_hashes.map(BigInt).sort().map(String),
    contracts: p.contract_addresses.map(BigInt).sort().map(String),
    keys: p.contracts_storage_keys.map((c) => [String(BigInt(c.contract_address)), c.storage_keys.map(BigInt).sort().map(String)]).sort(),
  });
  console.log(`storage proof params ${norm(recordedParams) === norm(ours) ? "match" : "DIFFER"} the recording`);
}

const started = Date.now();
const { session, osInputJson } = await buildOsInput({ TxSession, rpc, chainId: "SN_SEPOLIA", transaction, log: console.log });
const built = Date.now();
memory("input built");
fs.writeFileSync(path.join(out, "virtual-os-input.wasm.json"), osInputJson);
console.log(`input built in ${((built - started) / 1000).toFixed(2)} s from ${served.length} calls: ${[...new Set(served)].join(", ")}`);
console.log(`${session.run_os()} in ${((Date.now() - built) / 1000).toFixed(2)} s`);
memory("virtual OS done");

if (process.argv.includes("--prove")) {
  const proveStarted = Date.now();
  const result = JSON.parse(session.prove());
  memory("proved");
  const seconds = ((Date.now() - proveStarted) / 1000).toFixed(1);
  fs.writeFileSync(path.join(out, "response.wasm.json"), JSON.stringify(result));
  const native = JSON.parse(fs.readFileSync(path.join(capture, fs.readdirSync(capture).find((f) => f.startsWith("response-"))))).result;
  const facts = JSON.stringify(result.proof_facts) === JSON.stringify(native.proof_facts);
  const canonical = (messages) => JSON.stringify(messages.map((m) => [BigInt(m.from_address), BigInt(m.to_address), m.payload.map(BigInt)].map(String)));
  const messages = canonical(result.l2_to_l1_messages) === canonical(native.l2_to_l1_messages);
  console.log(`proved in ${seconds} s: proof ${result.proof.length} chars, ${result.proof === native.proof ? "IDENTICAL" : "DIFFERENT"} to the native proof; proof_facts ${facts ? "match" : "DIFFER"}; l2_to_l1_messages ${messages ? "match" : "DIFFER"}; wasm memory ${(process.memoryUsage().rss / 2 ** 30).toFixed(2)} GiB rss`);
}
