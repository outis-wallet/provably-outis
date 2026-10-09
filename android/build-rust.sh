#!/bin/sh
# Builds os_wasm_probe as a static library for 64-bit Android phones with the NDK's clang; the
# app's CMake build (app/src/main/cpp) links it from sequencer/target/aarch64-linux-android/release.
# Needs the cairo-lang venv (sequencer_venv) and `rustup +nightly-2026-01-15 target add
# aarch64-linux-android`; see docs/SHOWCASE.md.
set -e
cd "$(dirname "$0")/../sequencer"
. sequencer_venv/bin/activate
sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ndk="${ANDROID_NDK_HOME:-$sdk/ndk/27.1.12297006}"
bin="$ndk/toolchains/llvm/prebuilt/darwin-x86_64/bin"
api=26
export CC_aarch64_linux_android="$bin/aarch64-linux-android$api-clang"
export CXX_aarch64_linux_android="$bin/aarch64-linux-android$api-clang++"
export AR_aarch64_linux_android="$bin/llvm-ar"
export RANLIB_aarch64_linux_android="$bin/llvm-ranlib"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$bin/aarch64-linux-android$api-clang"
RUSTC_WRAPPER= cargo +nightly-2026-01-15 rustc --release --target aarch64-linux-android \
  -p os_wasm_probe --lib --crate-type staticlib
ls -l target/aarch64-linux-android/release/libos_wasm_probe.a
