#!/bin/sh
# Builds the web engine of outis.cash/prover: the worker (engine/), the threaded wasm build
# (pkg-mt/) and the captures of captures.txt trimmed to what the replay reads (captures/). The
# page itself is outis/wallet/apps/prover (React), whose public/ these go to; see
# docs/SHOWCASE.md.
#
# Usage: showcase/build-web.sh [out dir, default ../outis/wallet/apps/prover/public]
# (needs python3, zstd, gzip). Only engine/, pkg-mt/ and captures/ are replaced in the out dir.
# Pages served with it need COOP: same-origin and COEP: require-corp (threads need shared memory).
set -e
cd "$(dirname "$0")/.."
OUT=${1:-../outis/wallet/apps/prover/public}
PKG=${PKG:-web/tx/pkg-mt}
rm -rf "$OUT/engine" "$OUT/pkg-mt" "$OUT/captures"
mkdir -p "$OUT/engine" "$OUT/pkg-mt" "$OUT/captures/classes"

# The wasm module: no name section (debug symbols, 63 MiB), gzipped, named by its hash so it can
# be cached forever.
tmp=$(mktemp -d)
zstd -d -q -f "$PKG/os_wasm_probe_bg.wasm.zst" -o "$tmp/raw.wasm"
python3 - "$tmp/raw.wasm" "$tmp/stripped.wasm" <<'PY'
import sys
def leb(data, i):
    result = shift = 0
    while True:
        byte = data[i]; i += 1; result |= (byte & 0x7F) << shift; shift += 7
        if byte < 0x80: return result, i
data = open(sys.argv[1], "rb").read()
out = bytearray(data[:8]); i = 8
while i < len(data):
    start = i; section = data[i]; i += 1; size, i = leb(data, i)
    if section == 0:
        name_length, j = leb(data, i)
        if data[j:j + name_length] == b"name":
            i += size
            continue
    out += data[start:i + size]; i += size
open(sys.argv[2], "wb").write(out)
PY
gzip -9 -n -c "$tmp/stripped.wasm" > "$tmp/module.wasm.gz"
hash=$(sha256sum "$tmp/module.wasm.gz" | cut -c1-12)
wasm_file="os_wasm_probe_bg.$hash.wasm.gz"
mv "$tmp/module.wasm.gz" "$OUT/pkg-mt/$wasm_file"
rm -rf "$tmp"

# The JS glue, and wasm-bindgen-rayon's worker helper, which imports its package as a directory
# ('../../..'): static hosts serve no module for a directory, so point it at the file.
cp "$PKG/os_wasm_probe.js" "$OUT/pkg-mt/"
cp -r "$PKG/snippets" "$OUT/pkg-mt/"
sed -i.bak "s|import('../../..')|import('../../../os_wasm_probe.js')|" "$OUT"/pkg-mt/snippets/*/src/workerHelpers.js
rm -f "$OUT"/pkg-mt/snippets/*/src/workerHelpers.js.bak

# The engine.
sed "s|__WASM_FILE__|$wasm_file|" showcase/web/worker.mjs > "$OUT/engine/worker.mjs"
cp tools/tx-driver.mjs "$OUT/engine/"

# The captures: the request, the native prover's response (for the identity check) and the RPC
# log with each getClass answer cut to the three felts the replay reads (its Sierra version). The
# CASM of the classes is shared.
grep -v '^#' showcase/captures.txt | while read -r action dir; do
  [ -n "$action" ] || continue
  python3 - "captures/$dir" "$OUT/captures/$action" "$OUT/captures/classes" <<'PY'
import glob, json, os, shutil, sys
source, target, classes = sys.argv[1:4]
os.makedirs(target, exist_ok=True)
shutil.copy(glob.glob(os.path.join(source, "request-*.json"))[0], os.path.join(target, "request.json"))
shutil.copy(glob.glob(os.path.join(source, "response-*.json"))[0], os.path.join(target, "response.json"))
with open(os.path.join(source, "rpc-log.jsonl")) as log, open(os.path.join(target, "rpc-log.jsonl"), "w") as out:
    for line in log:
        entry = json.loads(line)
        if entry["request"].get("method") == "starknet_getClass" and "result" in entry["response"]:
            entry["response"]["result"] = {"sierra_program": entry["response"]["result"]["sierra_program"][:3]}
        out.write(json.dumps({"request": entry["request"], "response": entry["response"]}) + "\n")
for casm in glob.glob(os.path.join(source, "casm-*.json")):
    shutil.copy(casm, classes)
PY
done

du -sh "$OUT/pkg-mt/$wasm_file" "$OUT/captures"
