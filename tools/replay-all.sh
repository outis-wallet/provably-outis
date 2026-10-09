#!/bin/sh
# Replays every capture under a flow directory (its NN/ subdirectories, made by capture-router.py)
# natively and in Node, and prints one summary line per capture and mode. Uses the prover submodule's
# builds: prover/scripts/build-native.sh and prover/scripts/build-wasm.sh node.
# Usage: tools/replay-all.sh captures/own-pool-flow [native|node|both]
set -e
cd "$(dirname "$0")/.."
flow="$1"; mode="${2:-both}"
probe=prover/target/release/os_native_probe
for capture in "$flow"/[0-9][0-9]; do
  [ -f "$capture/virtual-os-input.json" ] || { echo "$capture: no capture (our prover failed?)"; continue; }
  label=$(cat "$capture/label" 2>/dev/null || basename "$capture")
  if [ "$mode" != node ]; then
    "$probe" replay "$capture" "$capture/native-result.json" > "$capture/native-replay.log" 2>&1 || true
    echo "$label native: $(grep -E 'n_steps=' "$capture/native-replay.log" | sed 's/ memory=.*//') | $(tail -1 "$capture/native-replay.log")"
  fi
  if [ "$mode" != native ]; then
    OUT="$capture/replay-out" node prover/js/replay.mjs "$capture" --prove > "$capture/node-replay.log" 2>&1 || true
    echo "$label node: $(grep -E '^proved in' "$capture/node-replay.log" || tail -2 "$capture/node-replay.log")"
  fi
done
