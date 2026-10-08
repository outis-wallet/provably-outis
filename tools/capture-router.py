"""Captures each starknet_proveTransaction with OUR prover and answers it with a SUBMIT prover.

For every request: first OUR prover (PROOF2) proves it; its node traffic goes through
rpc-record-proxy.py and its virtual OS input is dumped (VIRTUAL_OS_INPUT_DUMP). The request, our
response, that traffic, the dump and the node's CASM for the classes it read are saved in
OUT/NN/, which tools/replay.mjs and `os_native_probe replay` take as a capture. Then the SUBMIT
prover (e.g. the 0.14.3 PROOF1 image, reading the node directly) proves it again, and its answer
goes back to the caller, so a flow like the spike's moves on on-chain.

Env: OURS, SUBMIT (prover URLs), OUT (captures dir), RPC_LOG (the rpc-log.jsonl that
rpc-record-proxy.py appends to), DUMP (our prover's VIRTUAL_OS_INPUT_DUMP path), NODE (for CASM),
PORT (default 3001).
"""
import http.server, json, os, shutil, time, urllib.request

OURS = os.environ.get("OURS", "http://127.0.0.1:3000")
SUBMIT = os.environ.get("SUBMIT", "http://127.0.0.1:3002")
OUT = os.environ["OUT"]
RPC_LOG = os.environ["RPC_LOG"]
DUMP = os.environ["DUMP"]
NODE = os.environ.get("NODE", "http://127.0.0.1:9545/rpc/v0_10")
PORT = int(os.environ.get("PORT", "3001"))


def post(url, body, timeout=1800):
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def log_lines():
    try:
        with open(RPC_LOG, "rb") as log:
            return log.readlines()
    except FileNotFoundError:
        return []


class Handler(http.server.BaseHTTPRequestHandler):
    count = 0

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        Handler.count += 1
        step = os.path.join(OUT, f"{Handler.count:02d}")
        os.makedirs(step, exist_ok=True)
        stamp = time.strftime("%H%M%S")
        with open(os.path.join(step, f"request-{stamp}.json"), "wb") as f:
            f.write(body)

        before = len(log_lines())
        started = time.time()
        status, ours = post(OURS, body)
        ours_seconds = time.time() - started
        with open(os.path.join(step, f"response-{stamp}.json"), "wb") as f:
            f.write(ours)
        traffic = log_lines()[before:]
        with open(os.path.join(step, "rpc-log.jsonl"), "wb") as f:
            f.writelines(traffic)
        if os.path.exists(DUMP) and os.path.getmtime(DUMP) >= started:
            shutil.copy(DUMP, os.path.join(step, "virtual-os-input.json"))
        classes = set()
        for line in traffic:
            request = json.loads(line).get("request", {})
            if request.get("method") == "starknet_getClass":
                classes.add(request["params"]["class_hash"])
        for class_hash in classes:
            casm_body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "starknet_getCompiledCasm",
                                    "params": {"class_hash": class_hash}}).encode()
            _, casm = post(NODE, casm_body, timeout=300)
            with open(os.path.join(step, f"casm-{class_hash}.json"), "wb") as f:
                f.write(casm)
        ours_ok = b'"result"' in ours[:200]

        started = time.time()
        status, answer = post(SUBMIT, body)
        submit_seconds = time.time() - started
        with open(os.path.join(step, "submit-response.json"), "wb") as f:
            f.write(answer)
        print(f"{Handler.count:02d} {stamp}: ours {'ok' if ours_ok else 'FAILED'} in {ours_seconds:.1f} s "
              f"({len(traffic)} node calls, {len(classes)} classes); submit prover {status} in "
              f"{submit_seconds:.1f} s", flush=True)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(answer)))
        self.end_headers()
        self.wfile.write(answer)

    def log_message(self, *args):
        pass


http.server.HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
