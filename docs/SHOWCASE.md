# Outis Prover: the showcase app

An app that proves the four captured Privacy Pool actions (prover/captures: Bob registers,
Alice shields 5 STRK, Alice sends Bob 3 [STRK], Bob unshields 2 [STRK]) on the device. It shows
how long the proof took, what it says, and what stays private. It is styled after Outis
(Midnight Sage, from outis/wallet/packages/ui).

## Layout

One UI for every platform, in React, in the Outis repository: `outis/wallet/apps/prover`. It has
two builds:
- **native** (`pnpm build:native`): one classic script and stylesheet with two pages, loaded from
  files. These are `showcase/index.html`, `results.html`, `app.js` and `app.css` here. They are
  generated: don't edit them, edit the React app and build again (below).
- **web** (`pnpm build`): outis.cash/prover, proving in the browser with the wasm build. On
  screens 1024 px and wider the web build has a desktop layout (split view, results table). The
  native build never does, so an iPad in landscape keeps the phone UI.

Each app wraps the native build in a thin shell that runs the Rust prover.

| Path | What it is |
|---|---|
| `outis/wallet/apps/prover/src/` | The UI. `Prover.tsx`: the four steps, an action screen, the proving screen (phases, time, memory), the result, "How it works". `Results.tsx`: the results page. `content.ts`: the words and facts (actions, what each keeps private and makes public, phases, device names). `bridge.ts`: the page/native contract (below), the web engine and `?mock`. |
| `showcase/index.html`, `results.html`, `app.js`, `app.css` | The native build of it, generated. The apps bundle these. |
| `showcase/captures.txt` | The captures the apps bundle: action id, then capture directory. |
| `showcase/fonts/` | Ubuntu Sans (variable, Latin), Outis's typeface, under the Ubuntu Font Licence. `app.css` loads it from here. |
| `prover/` | The prover, a submodule: [outis-wallet/prover](https://github.com/outis-wallet/prover). The apps link its pipeline as a static library and bundle its captures; `prover/scripts/build-web-engine.sh` builds the web engine (worker, threaded wasm, captures) into `outis/wallet/apps/prover/public`. |
| `ios/TxProver/ShowcaseApp.swift` | The iOS shell: a WKWebView over the bundled page, and the bridge to `tx_prove_replay`. |
| `prover/crates/os_wasm_probe/src/replay.rs` | The prover entry point: `replay()` with `Progress` events, and the C ABI `tx_prove_replay(dir, threads, callback, context)`. |

## The contract (outis/wallet/apps/prover/src/bridge.ts)

- Page to native: `{type: "prove", action, threads}` and `{type: "ready"}`.
  - iOS receives them on `webkit.messageHandlers.prover`.
  - Android receives them on `ProvablyOutisAndroid.postMessage(json)`.
- Native to page: `provablyOutis.receive(message)`, with one of:
  - `{type: "event", event}`: a `Progress` event, as JSON.
  - `{type: "result", report, conditions}`: the `Report`, plus the thermal state before and after
    and Low Power Mode.
  - `{type: "error", message}`.
  - `{type: "auto", action, threads}`: launch arguments `--prove <action> [--threads N]`, for
    testing.
- Device info:
  - iOS sets `window.provablyOutisNative = {device, build}` before the page loads.
  - Android returns it from `ProvablyOutisAndroid.deviceJson()`.
  - Fields: `{platform, model, os, cores, ramGiB}`, and the optional ones of docs/RESULTS.md.
- Android's back button calls `provablyOutis.back()`. It returns true when the page handled it.

The prover's `Progress` events are `phase` (state, execute, os, prove, verify), `transaction`
(block, tx_hash), `os_steps`, `memory` (MiB, about every 250 ms) and `note`. `Report.peak.run_mib`
is sampled during the run (the physical footprint on Apple, RSS elsewhere), so a second proof in
the same app reports its own peak.

## Working on the UI

In `outis/wallet/apps/prover`: `pnpm dev`, then open `http://localhost:5196/prover/?mock` at
phone size. `?mock` simulates a run with real-looking events; add `&auto&action=pay` to start one
immediately. Without `?mock` the dev server proves with the wasm build, as the web does.

The generated native files open from files too: `showcase/index.html?mock` in a browser.

To update the apps' copy after changing the UI, run `showcase/sync-ui.sh`. It builds the UI from
the Outis checkout next to this one (`OUTIS=<path>` for another) and writes the four files here.
Then it prints the commit to make, naming the Outis commit they come from (`+dirty` if that
checkout had uncommitted changes in the app). The web engine changes only when the prover does:
`prover/scripts/build-wasm.sh web`, then `prover/scripts/build-web-engine.sh
<outis>/wallet/apps/prover/public`.

## iOS

1. `ios/build-rust.sh` builds the static library for the device and the simulator, in the
   `prover/` submodule (`git submodule update --init prover` first). It needs the cairo-lang venv,
   `prover/.venv` by default (`VENV=<path>` for another): `cd prover && uv venv && uv pip install
   cairo-lang==0.14.3a3`. The toolchain and its iOS targets come from `prover/rust-toolchain.toml`.
2. Build `ios/TxProver.xcodeproj` (scheme TxProver). Its "Bundle the showcase" phase copies
   `showcase/`'s pages, scripts, styles and fonts to `web/`, and each capture in `captures.txt`
   (from `prover/captures/`) to `captures/<action>/`.
3. Install and run:
   `xcrun devicectl device install app --device <udid> <DerivedData>/Build/Products/Release-iphoneos/TxProver.app`,
   then `xcrun devicectl device process launch --device <udid> dev.provablyoutis.TxProver [--prove pay]`.
   With `--console`, the report is printed after `SHOWCASE_RESULT`. Ending a `--console`
   session also ends the app.

Results through the app (2026-10-09, Alice sends Bob 3 [STRK], 459,169 steps):

| Device | Threads | Prove | Peak memory | Check |
|---|---|---|---|---|
| iOS Simulator on the M5 Pro | 18 | 5.4 s | 2366 MiB | identical |
| iPhone 12 Pro | 6 | 36.4 s | 2462 MiB | identical |

The page runs in WebKit's own process, so its memory does not count toward the app's limit.

Scores and the results page: docs/RESULTS.md. The apps add the build string and device fields;
the page sends the scores itself.

## Android

`android/` is the same shell in plain Java, with no AndroidX or Kotlin:
- `MainActivity.java`: a WebView over `file:///android_asset/web/index.html`, the
  `ProvablyOutisAndroid` bridge, the back button and the device info.
- `src/main/cpp/showcase_jni.c`: a JNI shim around `tx_prove_replay`. It attaches the prover's
  threads to forward their events to Java.
- `CMakeLists.txt`: links the shim with the Rust static library into `libshowcase.so`.
- `app/build.gradle`: syncs `showcase/` and the captures in `captures.txt` (from `prover/captures/`,
  with their contract classes copied from `prover/captures/classes`) into the assets. Each
  capture is copied to the files directory before its first proof, because `replay` reads a
  directory.

To build and install:

```
git submodule update --init prover                      # once; and the venv in prover/.venv (iOS above)
android/build-rust.sh
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -S -n dev.provablyoutis.showcase/.MainActivity [--es prove pay --ei threads 8]
```

With `--es prove`, the report is logged after `SHOWCASE_RESULT` (`adb logcat -s Showcase`).
Versions: Gradle 8.13, AGP 8.12, SDK 36, NDK 27.1, minSdk 29, targetSdk 34. With targetSdk 35
the app would be drawn under the system bars. The APK is 110 MB; `libshowcase.so` is 100 MB.

Gotchas:
- `privacy_prove`'s `LargeBlockCache` allocator took macOS's `MAP_ANONYMOUS` (0x1000) on
  `target_os = "android"`, so every large `mmap` failed: "rpc-log.jsonl: Kind(OutOfMemory)". Fixed
  in `proving/` (stwo `column.rs`): Android uses Linux's 0x20. The earlier Android runs used
  aarch64-unknown-linux-musl, so they never took that path.
- Static-archive symbols are exported from a `.so` by default, so `--gc-sections` keeps all of
  them (245 MB). `-Wl,--exclude-libs,ALL` and `--strip-debug` bring it to 100 MB.
- `TMPDIR`: privacy_prove writes a temporary file. Android 10 doesn't set `TMPDIR` for apps, so
  Rust picks `/data/local/tmp`, which apps can't write ("Permission denied (os error 13)" on the
  Galaxy S9+). MainActivity sets it to the app's cache directory. The S25+, on a newer Android, has
  it set already.
- TxSession's errors were wasm-bindgen `JsError`s, which can't be made natively: every failure read
  "cannot call wasm-bindgen imported functions on non-wasm targets". Natively they are now
  `Failure(message)` (lib.rs), so the app shows the real error.
- Android freezes an app that is not in the foreground. A proof started while the phone is locked
  waits until the app is brought to the front.

Results through the app (2026-10-09, Alice sends Bob 3 [STRK]):

| Device | Threads | Prove | Peak memory | Check |
|---|---|---|---|---|
| Galaxy S25+ (SM-S936U1) | 8 | 27.2 s | 2697 MiB RSS | identical |
| Galaxy S9+ (SM-G965U1, Android 10), Bob registers | 8 | 78.3 s | 2486 MiB RSS | identical |
