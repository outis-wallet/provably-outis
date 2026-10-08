"""Faithful JSON-RPC recording proxy: forwards every request to the node unchanged and appends
{path, request, response, seconds} lines to rpc-log.jsonl in OUT."""
import http.server, json, os, sys, time, urllib.request, threading

UPSTREAM = os.environ.get("UPSTREAM", "http://127.0.0.1:9545")
PORT = int(os.environ.get("PORT", "9547"))
OUT = os.environ["OUT"]
lock = threading.Lock()

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        started = time.time()
        request = urllib.request.Request(UPSTREAM + self.path, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=600) as upstream:
                status, answer = upstream.status, upstream.read()
        except urllib.error.HTTPError as error:
            status, answer = error.code, error.read()
        line = {"path": self.path, "status": status, "seconds": round(time.time() - started, 3)}
        try:
            line["request"] = json.loads(body)
        except ValueError:
            line["request_raw"] = body.decode(errors="replace")
        try:
            line["response"] = json.loads(answer)
        except ValueError:
            line["response_raw"] = answer.decode(errors="replace")
        with lock, open(os.path.join(OUT, "rpc-log.jsonl"), "a") as log:
            log.write(json.dumps(line) + "\n")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(answer)))
        self.end_headers()
        self.wfile.write(answer)

    def log_message(self, *args):
        pass

http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
