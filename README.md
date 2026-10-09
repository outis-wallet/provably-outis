# provably-outis

Client-side proving of Starknet transactions (an Outis privacy-pool transaction): execution, the
Starknet virtual OS and the privacy prover (PROOF2), in the browser (WebAssembly) and natively
(Linux, Android, macOS, iPadOS/iOS). The proofs are byte-identical to StarkWare's 0.14.4 transaction prover's and pass
the sequencer's verifier.

The prover itself is published as [outis-wallet/prover](https://github.com/outis-wallet/prover)
(here as the `prover/` submodule). This repository has the apps, the showcase's native build, the
raw captures and the research notes: the results are in `docs/BROWSER-TX-PLAN.md`, the Mac, iPad
and iPhone runs and their recipes in `docs/MAC-IOS-PLAN.md` (written when the prover was vendored
here; its paths under `sequencer/` and `proving/` are now in the prover repository and its forks).

Clone with the submodule: `git clone --recurse-submodules`, or `git submodule update --init prover`.

## Layout

| Path | What it is |
|---|---|
| `prover/` | The prover, as a submodule: [outis-wallet/prover](https://github.com/outis-wallet/prover), pinned. The pipeline crate (`os_wasm_probe`), its native and wasm builds, the JS driver and the web engine (`scripts/build-web-engine.sh`, for outis.cash/prover), and the four captures the apps prove. It builds on Outis's forks of StarkWare's sequencer and prover ([outis-wallet/sequencer](https://github.com/outis-wallet/sequencer), [outis-wallet/proving](https://github.com/outis-wallet/proving), whose `OUTIS.md` says what each change is and whose). Until 2026-10-09 these were vendored here as `sequencer/` and `proving/`. |
| `web/` | Test pages and `server.py` (COOP/COEP headers, `/rpc` forward to a node, optional HTTPS for the LAN). The `tx/` page proves a transaction (`?threads=N`, `&replay` to prove capture2 from its recording, `&trace`); the root and `mt/` pages are the earlier prover-only benchmark (`pair.json`). Prebuilt wasm is committed as `*.wasm.zst`. |
| `showcase/` | Outis Prover, the showcase UI the iOS and Android apps load: the four Privacy Pool actions proven on the device, in Outis's style. Generated from `outis/wallet/apps/prover` (React), which is also outis.cash/prover (`?mock` previews it in a browser). See `docs/SHOWCASE.md`. |
| `ios/` | The iOS app: `TxProver.xcodeproj` shows `showcase/` in a web view and links the pipeline as a static library (`build-rust.sh`). |
| `android/` | The Android app: the same, in a WebView, with the pipeline linked through a JNI shim (`build-rust.sh`, then `./gradlew assembleDebug`). |
| `tools/` | The recording proxies used to capture a transaction (`rpc-record-proxy.py`, `record-proxy.py`, `capture-router.py`), `replay-all.sh` (replays a flow's captures with the prover submodule's builds) and `proof2-cron.sh` (does Sepolia accept PROOF2 yet). The JS driver and the Node replay are in `prover/js/`. |
| `captures/capture2` | One captured Outis "bob registers" transaction: recorded RPC traffic, the prove request, the native prover's response (the identity reference), its virtual OS input, and node CASM. |
| `docs/` | `BROWSER-TX-PLAN.md` (everything, with recipes and gotchas), `MAC-IOS-PLAN.md`, `SHOWCASE.md` (the showcase app), `STRIPE-PLAN.md` (the striped prover). |
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
| MacBook Pro M5 Pro | 7.9 s (4.8 s with 18 threads) | 16.1 s Chrome, 21.9 s Safari | 2.3–2.7 GiB |
| iPad Air 5 (M1) | 14.9 s | 41.8 s Safari | 2.3–2.6 GiB |
| iPhone 17 Pro | 22.2 s (6 threads) | — | 2.3–2.5 GiB |
| iPhone 12 Pro | 40.8 s (6 threads) | Safari crashes (memory) | 2.3–2.4 GiB |
| x86 desktop | 16.7 s (9.8 s with 16 threads) | 28.6 s | 2.3–2.7 GiB |
| Galaxy S25+ | 26.0 s | 30.9 s | 2.34 GiB |
| Galaxy S9+ (2018) | 72.3 s | 134.2 s | 2.34 GiB |

On-chain submission is blocked for now: the Sepolia gateway rejects PROOF2.
