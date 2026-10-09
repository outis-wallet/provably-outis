# Outis Prover: the showcase app

An app that proves the four captured Privacy Pool actions (captures/own-pool-flow: Bob joins,
Alice shields 5 STRK, Alice sends Bob 3 [STRK], Bob unshields 2 [STRK]) on the device. It shows
how long the proof took, what it says, and what stays private. It is styled after Outis
(Midnight Sage, from outis/wallet/packages/ui).

## Layout

One UI for every platform, written in plain HTML, CSS and JS, with no build step. Each platform
wraps it in a thin native shell that runs the Rust prover.

| Path | What it is |
|---|---|
| `showcase/index.html`, `app.css`, `app.js` | The UI: the four steps, an action screen, the proving screen (phases, time, memory), the result, and "How it works". |
| `showcase/content.js` | The words and facts: the actions, what each keeps private and makes public, the phases, the reference devices, and device names. |
| `showcase/bridge.js` | The page/native contract (below), and `?mock`, a pretend engine for working on the UI in a browser. |
| `showcase/captures.txt` | The captures the apps bundle: action id, then capture directory. |
| `showcase/fonts/` | Ubuntu Sans (variable, Latin), Outis's typeface, under the Ubuntu Font Licence. |
| `ios/TxProver/ShowcaseApp.swift` | The iOS shell: a WKWebView over the bundled page, and the bridge to `tx_prove_replay`. |
| `sequencer/crates/os_wasm_probe/src/replay.rs` | The prover entry point: `replay()` with `Progress` events, and the C ABI `tx_prove_replay(dir, threads, callback, context)`. |

## The contract (showcase/bridge.js)

- Page to native: `{type: "prove", action, threads}`, `{type: "share", text}` and `{type: "ready"}`.
  - iOS receives them on `webkit.messageHandlers.prover`.
  - Android will receive them on `ProvinglyAndroid.postMessage(json)`.
- Native to page: `provingly.receive(message)`, with one of:
  - `{type: "event", event}`: a `Progress` event, as JSON.
  - `{type: "result", report, conditions}`: the `Report`, plus the thermal state before and after
    and Low Power Mode.
  - `{type: "error", message}`.
  - `{type: "auto", action, threads}`: launch arguments `--prove <action> [--threads N]`, for
    testing.
- Device info:
  - iOS sets `window.provinglyNative = {device}` before the page loads.
  - Android returns it from `ProvinglyAndroid.deviceJson()`.
  - Fields: `{platform, model, os, cores, ramGiB}`.
- Android's back button calls `provingly.back()`. It returns true when the page handled it.

The prover's `Progress` events are `phase` (state, execute, os, prove, verify), `transaction`
(block, tx_hash), `os_steps`, `memory` (MiB, about every 250 ms) and `note`. `Report.peak.run_mib`
is sampled during the run (the physical footprint on Apple, RSS elsewhere), so a second proof in
the same app reports its own peak.

## Working on the UI

Serve the folder with `python3 -m http.server 8766 -d showcase`, then open
`http://localhost:8766/?mock` at phone size. `?mock` simulates a run with real-looking events.
Add `&auto&action=pay` to start one immediately.

## iOS

1. `ios/build-rust.sh` builds the static library for the device and the simulator.
2. Build `ios/TxProver.xcodeproj` (scheme TxProver). Its "Bundle the showcase" phase copies
   `showcase/` to `web/`, and each capture in `captures.txt` to `captures/<action>/`.
3. Install and run:
   `xcrun devicectl device install app --device <udid> <DerivedData>/Build/Products/Release-iphoneos/TxProver.app`,
   then `xcrun devicectl device process launch --device <udid> dev.provingly.TxProver [--prove pay]`.
   With `--console`, the report is printed after `SHOWCASE_RESULT`. Ending a `--console`
   session also ends the app.

Results through the app (2026-10-09, Alice sends Bob 3 [STRK], 459,169 steps):

| Device | Threads | Prove | Peak memory | Check |
|---|---|---|---|---|
| iOS Simulator on the M5 Pro | 18 | 5.4 s | 2366 MiB | identical |
| iPhone 12 Pro | 6 | 36.4 s | 2462 MiB | identical |

The page runs in WebKit's own process, so its memory does not count toward the app's limit.

## Android

`android/` is the same shell in plain Java, with no AndroidX or Kotlin:
- `MainActivity.java`: a WebView over `file:///android_asset/web/index.html`, the
  `ProvinglyAndroid` bridge, sharing, the back button and the device info.
- `src/main/cpp/showcase_jni.c`: a JNI shim around `tx_prove_replay`. It attaches the prover's
  threads to forward their events to Java.
- `CMakeLists.txt`: links the shim with the Rust static library into `libshowcase.so`.
- `app/build.gradle`: syncs `showcase/` and the captures in `captures.txt` into the assets. Each
  capture is copied to the files directory before its first proof, because `replay` reads a
  directory.

To build and install:

```
android/build-rust.sh
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -S -n dev.provingly.showcase/.MainActivity [--es prove pay --ei threads 8]
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
- Android freezes an app that is not in the foreground. A proof started while the phone is locked
  waits until the app is brought to the front.

Results through the app (2026-10-09, Alice sends Bob 3 [STRK]):

| Device | Threads | Prove | Peak memory | Check |
|---|---|---|---|---|
| Galaxy S25+ (SM-S936U1) | 8 | 27.2 s | 2697 MiB RSS | identical |
