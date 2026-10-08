# Testing the client-side Starknet transaction prover on Mac and iPhone

This is the plan for repeating, on Apple hardware, what already works on Linux and Android: proving a
real Outis privacy-pool transaction client-side. The work runs the transaction, the Starknet virtual
OS and the privacy prover. It was written on 2026-10-08 on the Linux box (broody@ desktop). Read it
on the Mac without any other context.

## Status (2026-10-08, on the Mac)

Done on a MacBook Pro M5 Pro, an iPad Air 5th gen (M1) and an iPhone 17 Pro (native only). All
are replays and all are IDENTICAL. Results are in `BROWSER-TX-PLAN.md` ("Mac and iPad").

- Step 0b: done. Use `web/tx/?replay`. `web/tx/capture` is a symlink to `captures/capture2`
  (not a copy).
- Step 1: done in both browsers. Chrome ran headless with its own profile:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --user-data-dir=<tmp> "http://localhost:8765/tx/?replay&threads=8&auto"`. Safari: run
  `open -a Safari <same URL>`.
- Step 2: done. `replay` now prints peak RSS and peak footprint on macOS too.
- Step 3: done on the iPad (not the iPhone) with mkcert, without `mkcert -install` (the iPad only needs the
  public `rootCA.pem`).
  - Generate the cert:
    `mkdir -p web/certs && cd web/certs && mkcert -cert-file lan.pem -key-file lan-key.pem
    <host>.local <LAN IP> localhost`. `web/certs` is gitignored.
  - Serve:
    `cd web && CERT=certs/lan.pem KEY=certs/lan-key.pem HOST=0.0.0.0 python3 server.py 8443`.
  - AirDrop `$(mkcert -CAROOT)/rootCA.pem` (never `rootCA-key.pem`) to the device. Install it
    under Settings > General > VPN & Device Management, then turn on trust under About >
    Certificate Trust Settings.
  - To open the page from the Mac: `xcrun devicectl device process launch --device <udid>
    --payload-url "https://<host>.local:8443/tx/?replay&threads=8&auto" com.apple.mobilesafari`.
- Step 4: done on the iPad and the iPhone. A new device first needs pairing
  (`xcrun devicectl manage pair --device <id>`, then Trust on the device) and Developer Mode
  (Settings > Privacy & Security, restart). The app is `ios/TxProver.xcodeproj`. It is SwiftUI, links the static lib, and
  bundles capture2 through a build phase. Recipe:
  - `ios/build-rust.sh` builds the static lib for the device and the simulator. It needs the
    venv and `rustup +nightly-2026-01-15 target add aarch64-apple-ios aarch64-apple-ios-sim`.
  - Build and sign:
    `cd ios && xcodebuild -project TxProver.xcodeproj -scheme TxProver -configuration Release
    -destination 'id=<udid>' -allowProvisioningUpdates DEVELOPMENT_TEAM=<team> build`.
    The first time, this created an Apple Development certificate. The developer account must
    have the latest Program License Agreement accepted.
  - Install: `xcrun devicectl device install app --device <udid> <DerivedData>/Build/Products/Release-iphoneos/TxProver.app`.
  - Run: `xcrun devicectl device process launch --console --terminate-existing --device <udid>
    dev.provingly.TxProver --prove --threads 8`. The report is printed after
    `TX_PROVER_RESULT`.
  - The increased-memory-limit capability was not needed on the 8 GB iPad or the 12 GB iPhone.

## Open: why the iPad Air (M1) beats the iPhone 17 Pro

The iPad Air 5th gen (M1, 2022) proved in 14.9 s on 8 threads. The iPhone 17 Pro (A19 Pro)
took 22.2 s on 6 threads, about 1.5x slower. Each A19 Pro core is about 1.7x an M1 core, so
this is unexpected. The candidate causes, none of them measured yet:

1. Core mix. M1 is 4 performance + 4 efficiency cores; A19 Pro is 2 performance + 4 efficiency.
   The prover is a long all-core job. If its parallel parts split the work evenly, the slow
   efficiency cores set the pace, and the iPhone has 4 of 6 against the iPad's 4 of 8.
2. Sustained power. The iPhone is small, passively cooled and was charging on the cable. It
   may drop its clocks over a 22 s all-core run. ProcessInfo.thermalState stayed "nominal" on
   both devices, but that reading is coarse and does not show mild throttling.
3. Memory bandwidth per core. The prover moves about 2.3 GiB of working set. The M1 has a
   128-bit memory bus; the phone chip has less bandwidth to share.
4. Thread QoS. The rayon pool is built from a `.userInitiated` Swift task. If its threads get
   a lower QoS on iOS, the scheduler may keep them on efficiency cores.

Experiment (devices unlocked, screen on, same cable; about 5 minutes per device):

- iPhone: threads 6, 2, 4, 6, back to back, then once more at 6 after 5 minutes of cooling,
  unplugged if possible (not charging):
  `xcrun devicectl device process launch --console --terminate-existing --device <udid>
  dev.provingly.TxProver --prove --threads N`.
- iPad: threads 8, 4, 8.

Read the results:

- If 2 threads is close to 6 on the iPhone, its efficiency cores add little: cause 1. Compare
  4 threads on the iPad to 2 threads on the iPhone (performance cores only, per core).
- If the back-to-back runs at 6 slow down and the cooled run is faster: cause 2. Also try with
  Low Power Mode off and the phone on a cool surface.
- If neither explains it: time the phases. Turn on tracing natively in `tx_prove_replay`, as
  `init_logging` does on wasm, and compare the base trace commit with the FRI/FFT phases
  between devices: cause 3. For cause 4, set the pool threads' QoS with
  `pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED)` in a rayon `start_handler`.

The first try (2026-10-08) did not run: the launch was refused (`RequestDenied`, phone
locked) and then the phone was disconnected.

## What exists (Linux, 2026-10-08)

The pipeline is: JSON-RPC reads (done by JS or by a driver), then blockifier execution, storage
proofs, the virtual OS, the privacy prover (PROOF2), and finally the sequencer's verifier. It is one
Rust crate, `os_wasm_probe` in `sequencer/` (crates/os_wasm_probe). It builds for wasm (browser)
and natively.

Reference transaction: an Outis "bob registers" action (own pool) on Sepolia, captured with its
recorded RPC traffic. Replaying that capture must give a proof byte-identical to the native
0.14.4 tx prover's (`capture2/response-173903.json`). That identity is the correctness check
everywhere.

Numbers so far (8 threads unless noted):

| Device | Mode | Virtual OS | Prove | Peak memory | Check |
|---|---|---|---|---|---|
| x86 desktop (16 threads) | native replay | 0.30 s | 9.8 s | 2.73 GiB RSS | identical |
| x86 desktop | Chrome, live RPC | 1.1 s | 28.6 s | 2.39 GiB wasm | verified |
| Galaxy S25+ | native replay | 0.25 s | 26.0 s | 2.34 GiB RSS | identical |
| Galaxy S25+ | Chrome, live RPC | 1.1 s | 30.9 s | 2.36 GiB wasm | verified |
| Galaxy S9+ (2018) | native replay | 0.78 s | 72.3 s | 2.34 GiB RSS | identical |
| Galaxy S9+ | Chrome, live RPC | 2.2 s | 134.2 s | 2.36 GiB wasm | verified |

Full history, recipes and gotchas are in `BROWSER-TX-PLAN.md` (same folder).

## Goals on Apple hardware

1. macOS Safari and Chrome: the browser build, which is already compiled, served from localhost.
2. macOS native: `os_native_probe replay` on Apple silicon.
3. iPhone Safari: the browser build over HTTPS.
4. iPhone native: the same Rust pipeline in a minimal Swift app.

For each, record: virtual OS time, prove time, total, peak memory, and identical / verified.

## Step 0: get the code on the Mac

Everything is in the private repo `github.com/broody/provingly`. Its README has the layout. The
paths below are relative to its root.

```
git clone https://github.com/broody/provingly.git ~/dev/provingly && cd ~/dev/provingly
brew install zstd && scripts/unpack-wasm.sh
```

The `[patch]` paths in `sequencer/Cargo.toml` are relative (`../proving/...`), so nothing needs
rewriting. Path mapping from the Linux box: `sequencer-wasm` became `sequencer/`; `s144-wasm`
became `proving/`; `runs/wasm/web` became `web/`; `runs/wasm/tx` and `runs/osdump` became `tools/`;
`runs/capture2` became `captures/capture2`.

## Step 1: macOS browsers (no build needed)

1. Serve the pages. `localhost` is a secure context, so threads (SharedArrayBuffer) work without
   HTTPS:
   `cd ~/dev/provingly/web && python3 server.py 8765`
2. Pick live or replay:
   - Live RPC needs the Starknet node. `server.py` forwards POST `/rpc` to `RPC_URL`, default
     `http://127.0.0.1:9545/rpc/v0_10`. On Linux that port is an SSH tunnel to the user's node
     (`ssh -L 127.0.0.1:9545:127.0.0.1:9545 root@<node host>`). Set up the same tunnel on the Mac,
     or set `RPC_URL`.
   - Replay mode (no node) is NOT built yet; see Step 0b.
3. Open `http://localhost:8765/tx/?threads=8` (or `?threads=0` for 1 thread) in Safari and Chrome,
   and click Prove. Each run appends its progress lines and a final timing record to
   `web/results.log`. Add `&trace` for per-phase memory logs; they go to the console, which you
   reach with Safari > Develop > Show Web Inspector.
4. Expect about the desktop Chrome numbers. Safari is the interesting one:
   - whether it grows wasm memory to about 2.4 GiB;
   - nested workers for the thread pool.

## Step 0b: replay mode for the page (needed for iPhone, nice on Mac)

The iPhone has no `adb reverse`, and exposing the `/rpc` forward through a tunnel would expose the
node. So the page should be able to prove the captured transaction from the recorded files alone.
This is small, one session:

- Copy from `captures/capture2/` into `web/tx/capture/`: `rpc-log.jsonl`, `request-173903.json`, the two
  `casm-<class>.json` files, and `response-173903.json`.
- In `worker.mjs`, on `?replay`: build `rpc` from the recording. Port the lookup in
  `tools/replay.mjs`:
  - getStorageAt matched by (address, key);
  - getClass by class hash;
  - getCompiledCasm from `casm-<hash>.json`;
  - everything else by method.
  Use `capture/request-173903.json`'s transaction instead of `tx.json`.
- Compare the result's `proof` with `capture/response-173903.json`. It must be IDENTICAL, as in
  Node.

Test it on Linux (headless Chrome) or the Mac before taking it to the iPhone.

## Step 2: macOS native

Toolchain:
- rustup with `nightly-2026-01-15`;
- Python 3 with `uv`;
- a venv with `cairo-lang==0.14.3a3`. The `apollo_starknet_os_program` build script needs
  `cairo-compile` on PATH:
  `cd ~/dev/provingly/sequencer && uv venv sequencer_venv && . sequencer_venv/bin/activate && uv pip install cairo-lang==0.14.3a3`.
- Disable `sccache` if the repo config asks for it: `RUSTC_WRAPPER=`.

Build and run:

```
cd ~/dev/provingly/sequencer && . sequencer_venv/bin/activate
RUSTC_WRAPPER= cargo +nightly-2026-01-15 build --release -p os_wasm_probe --bin os_native_probe
/usr/bin/time -l ./target/release/os_native_probe replay ../captures/capture2 /tmp/mac-result.json
RAYON_NUM_THREADS=8 ./target/release/os_native_probe replay ../captures/capture2
```

`replay` prints the input, OS, prove and verify times and "proof IDENTICAL". Its own peak-RSS
reader uses `/proc`, so it prints 0 on macOS. Use `/usr/bin/time -l`'s "maximum resident set
size" (bytes) or "peak memory footprint" instead.

Possible snags:
- `privacy_prove`'s `LargeBlockCache` global allocator is `#[cfg(unix)]`, so it is active on
  macOS. Its Linux-only page calls are already guarded. If it misbehaves, gate it to
  `target_os = "linux"` and note the effect on memory.
- C dependencies (zstd) build with Xcode's clang. `c-kzg` is stubbed in this tree
  (`wasm-stubs/c-kzg`), so no blst is built.

## Step 3: iPhone Safari

Needs replay mode (Step 0b) and HTTPS, because threads need cross-origin isolation, which needs a
secure origin. Ways to get HTTPS, most private first:

1. **mkcert local CA.**
   - `brew install mkcert && mkcert -install`;
   - `mkcert <mac-hostname>.local <mac-LAN-IP>`;
   - AirDrop `$(mkcert -CAROOT)/rootCA.pem` to the iPhone, install the profile, then enable it under
     Settings > General > About > Certificate Trust Settings;
   - serve over HTTPS: wrap `server.py`'s socket with `ssl` and the generated cert/key, and bind
     `0.0.0.0` (it binds 127.0.0.1 today).
2. **Tailscale** on both devices: `tailscale serve` gives an HTTPS URL on the tailnet.
3. **Cloudflare quick tunnel** (`cloudflared tunnel --url http://localhost:8765`): a public random
   URL. Replay mode only, and close it after.

Then open `https://<host>:8765/tx/?replay&threads=8`. Results arrive in the Mac's `web/results.log`.
The console is in Safari on the Mac > Develop > <iPhone>.

Things to watch:
- iOS kills heavy tabs ("A problem repeatedly occurred"). Note the device RAM; the tab needs about
  2.4 GiB of wasm memory plus overhead.
- If threads fail, try `threads=4`, then the single-thread build (`threads=0`).

## Step 4: iPhone native

Needs:
- Xcode;
- an Apple ID (a free personal team can sideload for 7 days);
- the iPhone in Developer Mode, paired with the Mac;
- `rustup +nightly-2026-01-15 target add aarch64-apple-ios`.

Steps:

1. Rust side. Add a C entry point to `os_wasm_probe`, e.g. `os_native_probe`'s replay driver
   (`src/main.rs`, `fn replay`) moved into the library behind
   `#[no_mangle] extern "C" fn tx_prove_replay(dir: *const c_char) -> *mut c_char`. It returns a
   JSON summary (times, identical, verify result), with a matching free function. Add `staticlib`
   to `crate-type`. Build with
   `cargo +nightly-2026-01-15 build --release --target aarch64-apple-ios --lib -p os_wasm_probe`.
   Peak memory: read `task_info(TASK_VM_INFO).phys_footprint` before returning (that is what jetsam
   counts).
2. Swift side. A one-screen SwiftUI app with a Prove button:
   - call `tx_prove_replay` on a background thread, with the bundled `capture2` folder as a
     resource;
   - show the JSON;
   - link the static lib plus `libc++`, `Security` and `SystemConfiguration` if the linker asks.
3. Memory. Jetsam limits apps to a share of RAM. If it gets killed, add the
   `com.apple.developer.kernel.increased-memory-limit` capability. That capability may need a paid
   developer account.
4. Run on the device from Xcode. The debug navigator shows memory. Compare with the table above.

## Success criteria

- Replay runs: proof IDENTICAL to `capture2/response-173903.json`, and the verify result is Ok.
- Live runs: verified (the in-page verifier is the sequencer's `starknet_proof_verifier`).
- Record each result in a table like the one above, appended to `BROWSER-TX-PLAN.md`, with device,
  OS version, RAM, threads and thermal notes.

## Background gotchas (from the Linux/Android work)

- **Locks in threaded wasm.** dashmap's lock via `parking_lot_core` panics on park unless
  `parking_lot_core/nightly` is on. That feature is already in the `threads` build. The symptom is
  a silent hang.
- **stwo's BaseColumnPool on wasm.** Over-reserved capacity is real memory there. This is fixed in
  s144-wasm (buffers pass from stripe to stripe, no over-reserve on wasm).
- **No filesystem on wasm.** `privacy_prove` passes the bootloader output through a temp file;
  s144-wasm keeps it in memory on wasm.
- **simd128.** It needs `simd-adler32` 0.3.10 or later. Without simd128 the prover crate takes
  forever to compile.
- **u64 exports.** These arrive in JS as BigInt; `JSON.stringify` throws on them.
- **On-chain submission is still blocked.** The Sepolia gateway rejects PROOF2; these are
  measurement runs only.
