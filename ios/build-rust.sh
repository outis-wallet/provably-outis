#!/bin/sh
# Builds the prover (the prover submodule, github.com/outis-wallet/prover) as a static library for
# the iPhone and the iOS simulator; the Xcode project links it from prover/target/<triple>/release.
# Needs the cairo-lang venv (VENV, default prover/.venv); the toolchain and its iOS targets come
# from prover/rust-toolchain.toml. See docs/MAC-REACT-SHOWCASE.md.
# Usage: ios/build-rust.sh [target...] (default: aarch64-apple-ios aarch64-apple-ios-sim)
# Branch ios-gpu: prover/ is the GPU prover, built with FEATURES (default gpu: wgpu on Metal; the
# Xcode project links Metal and QuartzCore for it). FEATURES= builds the CPU-only library.
set -e
cd "$(dirname "$0")/../prover"
[ -f Cargo.toml ] || { echo "prover/ is empty: run git submodule update --init prover" >&2; exit 1; }
venv="${VENV:-.venv}"
[ -d "$venv" ] || venv="$HOME/outis-gpu-test/venv"
. "$venv/bin/activate"
features="${FEATURES-gpu}"
for target in ${*:-aarch64-apple-ios aarch64-apple-ios-sim}; do
  IPHONEOS_DEPLOYMENT_TARGET=17.0 RUSTC_WRAPPER= cargo rustc --release \
    --target "$target" -p os_wasm_probe --lib --crate-type staticlib ${features:+--features "$features"}
  ls -l "target/$target/release/libos_wasm_probe.a"
done
