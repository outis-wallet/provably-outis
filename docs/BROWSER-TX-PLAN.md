# Browser transaction proving (Outis privacy pool), option 3

Goal: produce the whole STRK20 privacy-pool proof in the browser: execute the transaction,
build the virtual OS input, run the virtual OS, prove with our striped prover (wasm, threads).
On-chain submission waits for the Sepolia gateway to accept PROOF2.

## Trees
- `~/development/sequencer-0144`: native 0.14.4 tx prover (PRIVACY-0.14.4-RC.0) patched to s144.
  Local hack: `VirtualOsBlockInput` derives Serialize and is dumped to `$VIRTUAL_OS_INPUT_DUMP`
  (runner.rs); blockifier `transaction_serde` feature on for the tx prover.
  Build: `RUSTC_WRAPPER= cargo +nightly-2026-01-15 build --release -p starknet_transaction_prover
  --bin starknet_transaction_prover --features stwo_proving` (with sequencer_venv active).
- `~/development/sequencer-wasm`: copy for wasm work. Changes:
  - apollo_infra_utils: jemalloc, tokio, command/run_until/tasks are non-wasm only;
  - workspace `cached` without default features; starknet_patricia tokio rt-multi-thread non-wasm;
  - `[patch.crates-io] c-kzg = wasm-stubs/c-kzg` (stub with the same API; every KZG op errors;
    alloy would not build against it natively, nothing on the OS path needs it);
  - starknet_os compiled_class hint: ret opcode literal as Felt (usize overflow on wasm32);
  - starknet_os `log_time!` skips Instant::now() on wasm32 (it panics there);
  - wasm-bindgen family pinned to 0.2.126 / js-sys 0.3.103 (matches the prover wasm and the CLI).
  - crate `os_wasm_probe`: mirror of VirtualOsBlockInput -> OsHints (same From as the tx prover;
    chain_id read by name because OsChainInfo deserializes it only from hex), `run_virtual_os`
    wasm export returning a PIE summary, native bin `os_native_probe`, panic hook to console.
  Wasm build: `RUSTC_WRAPPER= CARGO_TARGET_DIR=target-wasm RUSTFLAGS='--cfg getrandom_backend="wasm_js"
  -C link-arg=-zstack-size=16777216' cargo +nightly-2026-01-15 build --release --target
  wasm32-unknown-unknown -p os_wasm_probe --lib`, then `wasm-bindgen --target nodejs`.

## Capture (no on-chain submission)
`runs/osdump/record-proxy.py` on :3001 forwards starknet_proveTransaction to the tx prover on :3000,
saves request/response and answers the caller with an error, so the spike stops before submit.
Run: move `.state/proof-bob-registers.json` aside, `OUTIS_PROVER_URL=http://127.0.0.1:3001 pnpm -s
spike private`, put the file back. Captured 2026-10-08 17:29: request-172915.json (1.2 KB),
response-172915.json (proof), virtual-os-input.json (2.7 MB; 1 tx, 2 compiled classes).

## Results
- Virtual OS from the dump, native: n_steps 381442, holes 106267 (same as the live prover run),
  0.35 s. PIE hashes memory 8770f9b9289258d7, metadata 052b0338ad9d2c91,
  additional_data 519695c6563fa008, resources 34ed8dcb678d90cc. Deterministic.
- Same in wasm32 under Node 22: IDENTICAL hashes, 1.23 s, RSS 284 MiB.

## Input side (2026-10-08): JS does I/O, wasm does compute
- Same-run capture `runs/capture2` (17:39): `rpc-record-proxy.py` (faithful, port 9547 -> 9545,
  OUT=dir) between the tx prover (`--rpc-url http://127.0.0.1:9547/rpc/v0_10`) and the node, plus
  `record-proxy.py` (OUT=dir) on 3001 for the spike. Always capture the RPC log, the dump and the
  response in ONE run: `block_id: latest` moves.
- The native prover's node traffic (10 calls): getBlockWithTxHashes(latest);
  simulateTransactions(RETURN_INITIAL_READS, SKIP_FEE_CHARGE), prefetch WORKS (6 storage, 1 nonce,
  2 class hashes); getClass x2 (Sierra 1.2 + 1.9 MB, compiled locally); 3 getStorageAt misses
  (bob's account, one per execution round); getStorageProof at the block number; getClass x2 again.
- The node (spec 0.10.3-rc.0) serves starknet_getCompiledCasm, identical to the local compile
  (bytecode, hints, segment lengths, entry points). So no Sierra compiler in wasm: CASM from the
  node plus the Sierra version from the first 3 felts of getClass's sierra_program.
- os_wasm_probe now holds the pipeline (copied pure parts, PRIVACY-0.14.4-RC.0):
  committer_utils.rs (verbatim), storage_proofs.rs (query/split/merge/commitment infos),
  executor.rs (BlockHeader, BaseBlockInfo with latest constants + embedded bouncer config,
  execute), state_reader.rs (PrefetchedState: misses fail AND are recorded; is_declared defaults
  true like the RPC reader), lib.rs `TxSession` (new(chain, header, tx) with the prover's input
  checks, add_reads, add_class, add_undeclared_class, execute -> missing | storage_proof_params,
  set_storage_proofs -> OS input JSON, run_os). The committer runs on a tokio current-thread
  runtime (it tokio::spawns).
- JS: `runs/wasm/tx/tx-driver.mjs` (buildOsInput over any async rpc; pins all reads to the header's
  block number; miss loop), `replay.mjs <capture dir>` serves the recording (CASM from
  casm-<hash>.json, fetched live once).
- RESULT, Node replay of capture2: 4 execution rounds (3 single misses, as native), storage proof
  params match the recording, input built in 0.39 s, OS 1.16 s. PIE IDENTICAL to os_native_probe
  on the same run's native dump (memory cbc687804a267515, metadata 052b0338ad9d2c91,
  additional_data 519695c6563fa008, resources 34ed8dcb678d90cc; 381442 steps). The inputs differ
  only in the order of accessed_storage_keys (a set).

## Proving in the same wasm (in progress)
- `s144-wasm/` = s144 + `patches/wasm-hacks.patch` (the wasm-build hacks: sonic-rs -> serde_json in
  cairo-program-runner-lib, LargeBlockCache size check in u64, cube_252/partial_ec_mul pools on the
  current thread). sequencer-wasm's proving [patch] now points at s144-wasm.
- TxSession::prove(): privacy_recursive_prove(pie, precomputes), Proof::from, ProgramOutput ->
  try_into_proof_facts(VIRTUAL_SNOS): the tx prover's prove_virtual_snos_run. Returns the
  starknet_proveTransaction result JSON. verify_prove_result / os_native_probe `verify` use
  starknet_proof_verifier::verify_proof (the sequencer's verifier).
- `replay.mjs <capture> --prove` compares proof, proof_facts and messages with the native response.
- simd-adler32 bumped 0.3.7 -> 0.3.10 (0.3.10 builds with simd128, as in wasm-build), so the next
  build can use +simd128 (in target-wasm-simd). The first build has no simd128: slow to compile
  (stwo_cairo_prover > 20 min) and slow to prove.
- The node sends no CORS headers: web/server.py forwards POST /rpc to RPC_URL
  (default 127.0.0.1:9545/rpc/v0_10). Page: web/tx/ (index.html, worker.mjs, tx-driver.mjs
  symlink, tx.json = capture2's transaction), wasm-bindgen --target web into web/tx/pkg.

- privacy_recursive_prove passed the bootloader's output preimage through a NamedTempFile (a hint
  writes it, the prover reads it): no file system on wasm32-unknown-unknown. s144-wasm hack: on
  wasm the hint pushes it to a static (cairo-program-runner-lib take_output_preimage_dump) and
  privacy_prove takes it from there (privacy_recursive_prove only; _large untouched).
- With +simd128 (simd-adler32 0.3.10) the whole crate builds in under 5 min (target-wasm-simd);
  without simd128 stwo_cairo_prover alone ran 33+ min and was stopped. Module 115 MB.
- os_native_probe `verify`: the native response verifies Ok; a one-character tampered proof fails.
- RESULT, Node 22, 1 thread, replay of capture2 with --prove: proof IDENTICAL to the native tx
  prover's (305540 base64 chars), proof_facts match, l2_to_l1_messages same values (key order
  only). Prove 156 s; whole run 2:38; max RSS 3.46 GiB (native tx prover peak 3.1 GiB).

- RESULT, desktop headless Chrome 154, 1 thread, LIVE (web/tx/?auto, RPC through server.py /rpc
  to the node): block 16268277, 10 RPC calls, input 7.8 s, OS 1.0 s, prove 136.9 s, verify 0.1 s
  (VERIFIED, starknet_proof_verifier in wasm), wasm memory 3.24 GiB, PROOF2, 226 KB proof.
  Gotcha: u64 exports arrive as BigInt in JS; JSON.stringify throws on them.

- Threads: probe feature `threads` (wasm-bindgen-rayon, init_thread_pool), build in target-wasm-mt
  with the STRIPE-PLAN thread flags, bindings in web/tx/pkg-mt (server.py maps /tx/pkg-mt to its
  module), page `?threads=N`. First run DEADLOCKED in the adapter (StateTransitions::
  from_slice_parallel, all threads 0% CPU): dashmap 6 (adapter MemoryBuilder.inst_cache) parks via
  parking_lot_core, whose wasm parker PANICS on park unless its `nightly` feature is on; the rayon
  worker died silently. Fix: parking_lot_core `nightly` (wasm_atomic parker) in the threads
  feature. The earlier privacy_wasm never hit it: its input was prepared natively (no adapter).
- Logging: init_logging("info") sends tracing to console.log (fmt without time); the page also
  streams its log lines to /result (page "tx-log").
- RESULT, desktop headless Chrome 154, 8 threads, LIVE: block 16269302, input 7.5 s, OS 1.1 s,
  prove 27.2 s, verify 0.1 s VERIFIED, total 35.9 s, wasm memory 3.29 GiB.

- RESULT, Galaxy S9+ (2018, 5.4 GiB) Chrome, 8 threads, LIVE over adb reverse tcp:8765: block
  16269348, input 13.4 s, OS 2.2 s, prove 131.2 s, verify 0.3 s VERIFIED, total 147.1 s, wasm
  memory 3.29 GiB (MemAvailable was 3.5 GB). Stay-awake reverted after.

- Independent check: the page also POSTs the full result (page "tx-proof"); a live desktop proof
  (block 16269513, 36.0 s) verifies Ok with the NATIVE verifier (os_native_probe verify).
- Cleanup after capture: dump prover and both proxies stopped; tx prover restarted as before
  (:3000, RPC 9545, no dump); runs/capture2 made read-only. server.py stays on :8765.

## Memory (2026-10-08)
- Measurement: os_wasm_probe/src/memory.rs, a counting global allocator (wasm32) + memory_size;
  every tracing line is prefixed `[wasm W live L peak P]` (MiB), span ENTER events mark phases
  (not CLOSE: its timings read the clock). `replay.mjs <capture> --prove --trace` (outputs to
  runs/replay-out; the capture is read-only), page `?trace`.
- Before: wasm 3322 MiB, peak live 3265 (fragmentation only ~57 MiB, so an allocator swap is not
  worth it). The OS stage peaks at 93 MiB: everything is in prove(). Peak = Cairo base trace striped
  commit: +724 MiB at stripe 1, then +103 MiB per stripe, while the interaction commit (same size)
  grew 2 MiB per stripe.
- Cause: BaseColumnPool. Between stripes, columns of other sizes took and grew the buffers given
  back (grow into spare capacity) or got fresh ones at double capacity (reserved pages are free on
  Linux, real memory on wasm); idle buffers piled up per stripe until release_all_idle.
- Fix (s144-wasm only): new_striped hands each column's buffer straight to its next stripe (no
  give_back between stripes); take_or_alloc does not over-reserve on wasm32.
- After: Node 1 thread wasm 2368 MiB (peak live 2292), 153 s, proof IDENTICAL. Chrome desktop 8
  threads 2.39 GiB, prove 28.6 s, VERIFIED. S9+ 8 threads 2.36 GiB, prove 134.2 s, total 149.9 s,
  VERIFIED. -0.93 GiB (-28%).
- Peak now: still the base trace commit (witness ~1.75 GiB live + one stripe). Next candidates:
  what the 1.75 GiB holds (base coefficients ~0.49 GiB + lookup data for the interaction trace +
  anything of the adapter's ProverInput still alive).

## Native Android (2026-10-08)
- os_native_probe `replay <capture dir> [out.json]`: the same TxSession pipeline natively, driven by
  the recording (as replay.mjs), prints timings, verify verdict, IDENTICAL check, VmHWM.
- Cross build: in sequencer-wasm, PATH with ~/.local/zig/zig-x86_64-linux-0.14.1,
  `RUSTC_WRAPPER= CARGO_TARGET_DIR=target-arm RUSTFLAGS='' cargo +nightly-2026-01-15 zigbuild
  --release --target aarch64-unknown-linux-musl -p os_wasm_probe --bin os_native_probe` (3 min,
  98 MB static binary). On the phone: /data/local/tmp/tx-native (binary + capture2 files).
- x86 (16 threads): prove 9.8 s, peak RSS 2729 MiB; 8 threads 16.7 s / 2611 MiB; 1 thread
  112.5 s / 2529 MiB. All IDENTICAL.
- Galaxy S9+ native, 8 threads (Chrome force-stopped first, MemAvailable 3.8 GB): input 0.58 s
  (replay), OS 0.78 s, prove 72.3 s, verify 0.31 s Ok, peak RSS 2339 MiB, proof IDENTICAL to the
  native x86 prover's. Browser on the same phone: OS 2.2 s, prove 134.2 s, 2.36 GiB wasm.
- Galaxy S25+ native, 8 threads (MemAvailable 3.2 GB of 11 GB, 35 C at start, 38 C after): input
  0.18 s (replay), OS 0.25 s, prove 26.0 s, verify 0.20 s Ok, peak RSS 2341 MiB, IDENTICAL.
  S25+ Chrome right after (warmer), 8 threads, live: input 12.1 s, OS 1.1 s, prove 30.9 s, total
  44.2 s, wasm 2.36 GiB, VERIFIED. Native/browser prove ratio: S25+ 1.19x, S9+ 1.86x.

## Mac and iPad (2026-10-08, MAC-IOS-PLAN.md)
All replays of capture2: proof IDENTICAL to the native 0.14.4 prover's (proof, proof_facts,
messages), verifier Ok; PIE memory cbc687804a267515 everywhere. Peak memory: native = peak
physical footprint (task_info, what jetsam counts) / peak RSS; browser = wasm memory.

| Device | Mode | Threads | OS | Prove | Total | Peak memory |
|---|---|---|---|---|---|---|
| MacBook Pro M5 Pro (18 cores, 64 GB), macOS 26.5.2 | native | 18 | 0.17 s | 4.8 s | 5.1 s | 2.39 / 2.67 GiB |
| same | native | 8 | 0.15 s | 7.9 s | 8.2 s | 2.34 / 2.64 GiB |
| same | native | 1 | 0.16 s | 47.7 s | 48.0 s | 2.28 / 2.56 GiB |
| same | headless Chrome 154 | 8 | 0.5 s | 16.1 s | 16.9 s | 2.37 GiB wasm |
| same | headless Chrome 154 | 16 | 0.5 s | 19.2 s | 20.0 s | 2.40 GiB wasm |
| same | Safari 26.5.2 | 8 | 0.3 s | 21.9 s | 22.8 s | 2.35 GiB wasm |
| iPad Air 5th gen (M1, 8 cores, 8 GB), iPadOS 26.6.2 | native app | 8 | 0.31 s | 14.9 s | 15.4 s | 2.34 / 2.61 GiB |
| same | Safari (HTTPS, mkcert) | 8 | 0.4 s | 41.8 s | 47.2 s | 2.36 GiB wasm |
| iPhone 17 Pro (A19 Pro, 2P+4E cores, 12 GB), iOS 26.5.2 | native app | 6 | 0.25 s | 22.2 s | 22.7 s | 2.33 / 2.51 GiB |
| iPhone 12 Pro (A14, 2P+4E cores, 6 GB), iOS 26.6.2 (2026-10-09) | native app | 6 | 0.36 s | 40.8 s | 41.5 s | 2.30 / 2.40 GiB |
| same | Safari (HTTPS, mkcert) | 6, 2, 1 | 0.5 s | crashed | — | — |

- Thermal: nominal before and after on the iPad and both iPhones (ProcessInfo.thermalState); Mac
  on mains. iPhone 17 Pro: native only (no Safari run, by choice).
- iPhone 12 Pro Safari FAILS. The tab's process dies during prove(): about 18 s in with
  6 threads, 10 s with 2, and 6 s with the single-thread build. Safari reloads the tab once
  (`&auto` restarts the run), then gives up ("A problem repeatedly occurred"). There is no
  JetsamEvent and no crash report, so WebKit ended the page's process itself for going over
  its per-page memory limit; it does not log that. The page needs about 2.4 GiB of wasm plus
  the page process itself. That fits on the 8 GB iPad but not on a 6 GB phone. The native app
  on the same phone peaks at a 2.30 GiB footprint and finishes (a JetsamEvent mid-run killed
  only small background processes; TxProver was the largest process at 1.6 GiB resident).
  Thread count does not help, since the peak hardly depends on it. Next: have the page report
  the wasm size while proving (the main thread can poll the shared memory) to find the kill
  size. Lowering peak memory is what would make 6 GB iPhones work in Safari.
- Native/browser prove ratio: Mac Chrome 2.0x, Mac Safari 2.8x, iPad Safari 2.8x.
  JavaScriptCore's wasm is the slow part, not the device. Chrome gets slower past 8 threads.
- Safari (macOS and iPadOS) needs nothing special: it grows shared wasm memory to 2.4 GiB and
  runs wasm-bindgen-rayon's nested module workers. No tab kill on the 8 GB iPad.
- iPad and iPhone native: no jetsam kill without `increased-memory-limit` (footprint 2.34 GiB
  of 8 GB, 2.33 GiB of 12 GB, 2.30 GiB of 6 GB on the iPhone 12 Pro). The iPhone 17 Pro (2 performance cores) is slower than the M1
  iPad (4) and a little faster than the Galaxy S25+ native (26.0 s, 8 threads).
- Page replay mode: `web/tx/?replay` serves the RPC from `web/tx/capture` (a link to
  captures/capture2) with the same lookup as replay.mjs (now `replayRpc` in tx-driver.mjs) and
  compares with the native response (`compareWithNative`). `input_s` includes wasm load and
  the capture fetch (iPad Safari: 4.3 s of its 4.9 s was the wasm load).
- iPadOS Safari sends a Macintosh user agent (desktop mode); results.log records it as such.
- Native on Apple: `os_native_probe replay` now reads peak memory with task_info(TASK_VM_INFO),
  the struct through rev 3 (the kernel fills whole revisions only: a struct ending at
  ledger_phys_footprint_peak returns 0). macOS build: 3 min cold.
- iOS: the replay driver moved from main.rs into `os_wasm_probe::replay` with a C entry point
  `tx_prove_replay(capture_dir, threads)` (rayon pool with 16 MiB stacks: install() runs the
  whole pipeline on a pool thread). `ios/build-rust.sh` builds the staticlib (`cargo rustc
  --crate-type staticlib`, 480 MB unstripped) for aarch64-apple-ios and -ios-sim; the app
  (ios/TxProver.xcodeproj, SwiftUI) links it and bundles capture2. tikv-jemalloc-sys does not
  configure for aarch64-apple-ios-sim, so apollo_infra_utils leaves jemalloc out on iOS (only
  the sequencer binaries' set_global_allocator! uses it).
- Simulator (iPhone 17 Pro, on the M5 Pro): prove 9.8 s on 18 threads, IDENTICAL.

## Next
- DONE: prove in the same wasm (identical to native), browser live, threads, S9+.
- DONE: Mac (native, Chrome, Safari), iPad (native app, Safari), iPhone 17 Pro and iPhone 12 Pro
  (native app); see above.
- Open: the M1 iPad Air proves faster than the iPhone 17 Pro (14.9 s vs 22.2 s). The causes
  and the experiment are in MAC-IOS-PLAN.md ("Open: why the iPad Air beats the iPhone 17 Pro").
- S25+ run when it is attached.
- Hook into Outis: the SDK calls starknet_proveTransaction on PROVER_URL; an in-page prover
  could answer it (worker) instead of HTTP. Discuss with the user before building.
- Memory headroom: 3.29 GiB of the 4 GiB wasm32 cap. Bigger transactions may not fit; native
  (aarch64 tx prover binary on the phone, or memory64 later) has no cap.
- Native Android alternative (user asked 2026-10-08): cross-compile starknet_transaction_prover for
  aarch64 and run it on the phone on 127.0.0.1:3000; the phone browser's SDK calls it unchanged.

## Other actions: deposit, transfer, withdrawal (2026-10-08)

So far only "bob registers" had been proven. To measure the other actions, the chain needs real
notes. Sepolia rejects PROOF2, so each step was proven twice. `tools/capture-router.py` (port 3001)
sends every starknet_proveTransaction first to OUR 0.14.4 prover. That pass is the measured PROOF2
capture: its node traffic goes through rpc-record-proxy.py and its OS input is dumped. The router
then sends the request to the 0.14.3 docker prover (`murk-tx-prover:0.14.3-rc.2`, PROVER_PORT
3002). That PROOF1 answer goes back to the spike, which submits it so the next step has its
notes.

Run: `OUTIS_PROVER_URL=http://127.0.0.1:3001 pnpm -s spike private` (own pool), with the spike's
cached proofs moved to `.state/proof-cache-20261008/`. Captures are in `captures/own-pool-flow/NN/`
(label file, request, our response, rpc-log, OS input, CASM). From step 02 on, our prover had
both classes cached, so their getClass records and CASM were copied from 01
(`classes-from-01.txt`). Batch replay: `tools/replay-all.sh captures/own-pool-flow [native|node]`.

On-chain, Sepolia (all PROOF1, about 1.2-1.3 STRK fee each):
- bob registers: 0x0751a701...4a2e
- alice deposits 5 STRK: 0x05999d95...d09e
- alice pays bob 3: 0x02637c68...f37b
- bob withdraws 2: 0x012ce812...7174

After the run: alice holds 2 STRK privately, bob 1.

| Action | OS steps | Native prove, x86 36 threads | Native peak RSS | Wasm (Node, 1 thread) prove | Wasm memory (peak live) |
|---|---|---|---|---|---|
| bob registers | 381,442 | 10.0 s | 2754 MiB | 157.2 s | 2368 MiB (2292) |
| alice deposits | 450,235 | 10.7 s | 2764 MiB | 169.4 s | 2414 MiB (2353) |
| alice pays bob | 459,169 | 10.1 s | 2888 MiB | 149.2 s | 2451 MiB (2390) |
| bob withdraws | 461,365 | 9.9 s | 2875 MiB | 149.6 s | 2451 MiB (2390) |

Every proof is IDENTICAL to our native prover's and verifies Ok, native and wasm. Deposit,
transfer and withdrawal run 18-21% more OS steps than register. None crosses a power-of-two
trace size, so prove time is the same within noise and memory is +2-4% (wasm +83 MiB at most).
Expect the phone numbers above to hold for all four actions. Not measured yet: a transfer that
spends several notes, and the public pool.
