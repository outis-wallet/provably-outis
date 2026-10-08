"""Serves this directory for the phone test and appends what the page POSTs to /result to results.log.
POST /rpc is forwarded to the Starknet node (RPC_URL), which sends no CORS headers itself.
Other devices need HTTPS (threads need a secure context): CERT=cert.pem KEY=key.pem HOST=0.0.0.0
serves TLS on all interfaces (an mkcert certificate; see docs/MAC-IOS-PLAN.md)."""
import http.server, os, ssl, sys, datetime, urllib.request

RPC_URL = os.environ.get('RPC_URL', 'http://127.0.0.1:9545/rpc/v0_10')
HOST = os.environ.get('HOST', '127.0.0.1')

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript'}
    def translate_path(self, path):
        # wasm-bindgen-rayon's worker helper imports its package by directory ('../../..'), which a
        # bundler would resolve to the package's module: serve that module for the directory.
        bare = path.split('?')[0].rstrip('/')
        if bare.endswith('/mt/pkg'):
            path = '/mt/pkg/privacy_wasm.js'
        elif bare.endswith('/tx/pkg-mt'):
            path = '/tx/pkg-mt/os_wasm_probe.js'
        return super().translate_path(path)

    def guess_type(self, path):
        return 'text/javascript' if str(path).endswith('.js') else super().guess_type(path)

    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_POST(self):
        if self.path.split('?')[0] == '/rpc':
            return self.forward_rpc()
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        with open('results.log', 'a') as f:
            f.write(f"{datetime.datetime.now(datetime.UTC).strftime('%H:%M:%S')} {body}\n")
        self.send_response(204); self.end_headers()

    def forward_rpc(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        request = urllib.request.Request(RPC_URL, data=body, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=300) as upstream:
                status, answer = upstream.status, upstream.read()
        except urllib.error.HTTPError as error:
            status, answer = error.code, error.read()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(answer)))
        self.end_headers()
        self.wfile.write(answer)

server = http.server.ThreadingHTTPServer((HOST, int(sys.argv[1])), Handler)
if os.environ.get('CERT'):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(os.environ['CERT'], os.environ.get('KEY'))
    # Handshake in the request's thread, so a stalled client does not block accept().
    server.socket = context.wrap_socket(server.socket, server_side=True, do_handshake_on_connect=False)
server.serve_forever()
