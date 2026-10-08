"""Forwards starknet_proveTransaction to the local prover, records request and response, and
answers the caller with an error so the spike stops before submitting anything on-chain."""
import http.server, json, os, time, urllib.request

UPSTREAM = os.environ.get("UPSTREAM", "http://127.0.0.1:3000")
OUT = os.environ.get("OUT", os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        stamp = time.strftime("%H%M%S")
        open(os.path.join(OUT, f"request-{stamp}.json"), "wb").write(body)
        request = urllib.request.Request(UPSTREAM, data=body, headers={"Content-Type": "application/json"})
        started = time.time()
        with urllib.request.urlopen(request, timeout=1800) as upstream:
            answer = upstream.read()
        open(os.path.join(OUT, f"response-{stamp}.json"), "wb").write(answer)
        print(f"recorded {stamp}: {len(body)} B in, {len(answer)} B out, {time.time() - started:.1f} s", flush=True)
        request_id = json.loads(body).get("id")
        reply = json.dumps({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": "recorded only, not returned"}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)

http.server.HTTPServer(("127.0.0.1", 3001), Handler).serve_forever()
