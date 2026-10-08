#!/bin/sh
# Decompresses the prebuilt wasm modules (committed as *.wasm.zst) next to themselves.
set -e
cd "$(dirname "$0")/.."
find web tools -name '*.wasm.zst' | while read -r packed; do
  zstd -d -q -f "$packed" -o "${packed%.zst}"
  echo "unpacked ${packed%.zst}"
done
