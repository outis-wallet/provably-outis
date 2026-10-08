# provingly

Client-side proving of Starknet transactions (an Outis privacy-pool transaction): execution, the
Starknet virtual OS and the privacy prover (PROOF2), in the browser (WebAssembly) and natively
(Linux, Android). The proofs are byte-identical to StarkWare's 0.14.4 transaction prover's and pass
the sequencer's verifier.

Snapshot of the work done on 2026-10-08. The results are in `docs/BROWSER-TX-PLAN.md`; the next
step, Mac and iPhone, is planned in `docs/MAC-IOS-PLAN.md`.

## Layout

| Path | What it is |
|---|---|
| `sequencer/` | starkware-libs/sequencer at `PRIVACY-0.14.4-RC.0` (commit `0ee373ac`) plus our changes. The pipeline crate is `crates/os_wasm_probe` (wasm `TxSession`, native `os_native_probe`), with `wasm-stubs/c-kzg` and a few wasm build fixes. Its `[patch]` section points at `../proving`. |
| `proving/` | starkware-libs/proving at `2b495a36` plus our striped (stripe-0 residency) prover, after ryun1's public description, plus wasm fixes: output preimage in memory, buffer pool. |
| `web/` | Test pages and `server.py` (COOP/COEP headers, `/rpc` forward to a node). The `tx/` page proves a transaction (`?threads=N`, `&trace`); the root and `mt/` pages are the earlier prover-only benchmark (`pair.json`). Prebuilt wasm is committed as `*.wasm.zst`. |
| `tools/` | `tx-driver.mjs` (the JS side: RPC reads and the miss loop), `replay.mjs` (Node replay of a capture, `--prove --trace`), `os-node/` (Node build), and the recording proxies used to capture a transaction. |
| `captures/capture2` | One captured Outis "bob registers" transaction: recorded RPC traffic, the prove request, the native prover's response (the identity reference), its virtual OS input, and node CASM. |
| `docs/` | `BROWSER-TX-PLAN.md` (everything, with recipes and gotchas), `MAC-IOS-PLAN.md`, `STRIPE-PLAN.md` (the striped prover). |
| `patches/` | The same changes as patches against upstream, plus earlier provably.fast candidates. |
| `results/` | Browser run log (`browser-results.log`: desktop, Galaxy S9+ and S25+) and memory traces before and after the buffer-pool fix. |

## Quick start

```
scripts/unpack-wasm.sh                      # needs zstd; writes the *.wasm files

# Node replay of the capture: the proof must come out IDENTICAL to the native prover's.
cd tools && node replay.mjs ../captures/capture2 --prove

# Browser: localhost is a secure context, so threads work without HTTPS.
cd web && python3 server.py 8765            # then open http://localhost:8765/tx/?threads=8
# Live RPC needs a Starknet node at RPC_URL (default http://127.0.0.1:9545/rpc/v0_10) that
# serves starknet_getStorageProof, getCompiledCasm and simulate with RETURN_INITIAL_READS.

# Native (any host with Rust nightly-2026-01-15 and a cairo-lang 0.14.3a3 venv; see docs):
cd sequencer && RUSTC_WRAPPER= cargo +nightly-2026-01-15 build --release -p os_wasm_probe --bin os_native_probe
./target/release/os_native_probe replay ../captures/capture2
```

Build recipes for wasm (single thread and threaded), Android (aarch64 musl via cargo-zigbuild) and
the gotchas are in `docs/BROWSER-TX-PLAN.md`.

## Numbers so far (8 threads)

| Device | Native prove | Browser prove | Peak memory |
|---|---|---|---|
| x86 desktop | 16.7 s (9.8 s with 16 threads) | 28.6 s | 2.3–2.7 GiB |
| Galaxy S25+ | 26.0 s | 30.9 s | 2.34 GiB |
| Galaxy S9+ (2018) | 72.3 s | 134.2 s | 2.34 GiB |

On-chain submission is blocked for now: the Sepolia gateway rejects PROOF2.
