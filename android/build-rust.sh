#!/bin/sh
# Builds the prover (the prover submodule, github.com/outis-wallet/prover) as a static library for
# 64-bit Android phones with the NDK's clang; the app's CMake build (app/src/main/cpp) links it from
# prover/target/aarch64-linux-android/release. Needs the cairo-lang venv (VENV, default
# prover/.venv); the toolchain and its Android target come from prover/rust-toolchain.toml. See
# docs/SHOWCASE.md.
# With FEATURES (default gpu: wgpu on Vulkan, the GPU the app offers the page); FEATURES= builds the
# CPU-only library.
set -e
cd "$(dirname "$0")/../prover"
[ -f Cargo.toml ] || { echo "prover/ is empty: run git submodule update --init prover" >&2; exit 1; }
. "${VENV:-.venv}/bin/activate"
sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ndk="${ANDROID_NDK_HOME:-$sdk/ndk/27.1.12297006}"
bin="$ndk/toolchains/llvm/prebuilt/darwin-x86_64/bin"
api=26
export CC_aarch64_linux_android="$bin/aarch64-linux-android$api-clang"
export CXX_aarch64_linux_android="$bin/aarch64-linux-android$api-clang++"
export AR_aarch64_linux_android="$bin/llvm-ar"
export RANLIB_aarch64_linux_android="$bin/llvm-ranlib"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$bin/aarch64-linux-android$api-clang"
features="${FEATURES-gpu}"
RUSTC_WRAPPER= cargo rustc --release --target aarch64-linux-android \
  -p os_wasm_probe --lib --crate-type staticlib ${features:+--features "$features"}
ls -l target/aarch64-linux-android/release/libos_wasm_probe.a
