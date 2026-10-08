#!/bin/sh
# Builds os_wasm_probe as a static library for the iPhone and the iOS simulator; the Xcode project
# links it from sequencer/target/<triple>/release. Needs the cairo-lang venv (sequencer_venv) and
# the iOS targets of nightly-2026-01-15; see docs/MAC-IOS-PLAN.md.
# Usage: ios/build-rust.sh [target...] (default: aarch64-apple-ios aarch64-apple-ios-sim)
set -e
cd "$(dirname "$0")/../sequencer"
. sequencer_venv/bin/activate
for target in ${*:-aarch64-apple-ios aarch64-apple-ios-sim}; do
  IPHONEOS_DEPLOYMENT_TARGET=17.0 RUSTC_WRAPPER= cargo +nightly-2026-01-15 rustc --release \
    --target "$target" -p os_wasm_probe --lib --crate-type staticlib
  ls -l "target/$target/release/libos_wasm_probe.a"
done
