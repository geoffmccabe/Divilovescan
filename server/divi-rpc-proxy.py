#!/usr/bin/env python3
"""Hardened read-only bridge in front of the Divi node's JSON-RPC.

Why this exists as well as the allow-list in the Cloudflare Function:

The Cloudflare Tunnel publishes a hostname. Anything that reaches that hostname
bypasses the Worker completely, so the Worker's allow-list alone is not a
security boundary — it is only a convenience. This process IS the boundary. It
runs on the node, listens on localhost only, and refuses everything that is not
a read-only chain query.

Consequences of that design:
  * The Divi RPC port is never exposed, not even to the tunnel.
  * A leaked tunnel hostname yields read-only chain data and nothing else.
  * Wallet, key, signing and node-control RPCs are unreachable by construction,
    because they are simply absent from the allow-list below.

Configuration comes from the environment so no credential is ever written into
this file or the repository:
    DIVI_RPC_URL     e.g. http://127.0.0.1:51473/
    DIVI_RPC_USER
    DIVI_RPC_PASS
    SCAN_SHARED_SECRET   required in the X-Scan-Secret header on every request
    PROXY_PORT           default 5174
"""

import base64
import json
import os
import socketserver
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

# Read-only chain queries ONLY. Adding anything here that touches the wallet
# would defeat the entire purpose of this process.
ALLOWED = {
    "getblockchaininfo",
    "getblockcount",
    "getblockhash",
    "getblock",
    "getrawtransaction",
    "getaddressbalance",
    "getaddresstxids",
    "getaddressutxos",
    "getaddressdeltas",
    "getspentinfo",
    "getlotteryblockwinners",
}

RPC_URL = os.environ.get("DIVI_RPC_URL", "http://127.0.0.1:51473/")
RPC_USER = os.environ.get("DIVI_RPC_USER", "")
RPC_PASS = os.environ.get("DIVI_RPC_PASS", "")
SHARED_SECRET = os.environ.get("SCAN_SHARED_SECRET", "")
PORT = int(os.environ.get("PROXY_PORT", "5174"))

# A request body large enough to be interesting is a request body large enough
# to be an attack.
MAX_BODY = 8192
RPC_TIMEOUT = 20

if not SHARED_SECRET:
    sys.exit("refusing to start: SCAN_SHARED_SECRET is not set")


class Handler(BaseHTTPRequestHandler):
    # Keep the node's address out of the logs and drop per-request noise.
    def log_message(self, fmt, *args):
        pass

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Lets the tunnel and any monitoring confirm the process is alive
        # without revealing anything about the node.
        if self.path == "/health":
            return self._send(200, {"ok": True})
        self._send(405, {"error": "POST only."})

    def do_POST(self):
        if self.headers.get("X-Scan-Secret", "") != SHARED_SECRET:
            # Deliberately identical to the unsupported-method response so a
            # prober cannot distinguish "wrong secret" from "unknown method".
            return self._send(403, {"error": "Unsupported query."})

        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            return self._send(400, {"error": "Malformed request."})
        if length <= 0 or length > MAX_BODY:
            return self._send(400, {"error": "Malformed request."})

        try:
            req = json.loads(self.rfile.read(length))
            method = str(req.get("method", ""))
            params = req.get("params") or []
            if not isinstance(params, list):
                raise ValueError
        except Exception:
            return self._send(400, {"error": "Malformed request."})

        if method not in ALLOWED:
            return self._send(403, {"error": "Unsupported query."})

        payload = json.dumps({"jsonrpc": "1.0", "id": "scan", "method": method, "params": params})
        auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()
        rq = urllib.request.Request(
            RPC_URL,
            data=payload.encode(),
            headers={"content-type": "application/json", "authorization": f"Basic {auth}"},
        )

        try:
            with urllib.request.urlopen(rq, timeout=RPC_TIMEOUT) as r:
                out = json.load(r)
        except urllib.error.HTTPError as e:
            # The node answers RPC-level errors with a 500 and a JSON body; pass
            # the message through, since these are user-meaningful.
            try:
                out = json.load(e)
            except Exception:
                return self._send(502, {"error": "The Divi node rejected that query."})
        except Exception:
            return self._send(503, {"error": "The Divi node is not responding right now."})

        if out.get("error"):
            msg = (out["error"] or {}).get("message", "Query failed.")
            return self._send(404, {"error": msg})
        self._send(200, {"result": out.get("result")})


class Server(socketserver.ThreadingTCPServer):
    # One slow chain query must never block the others — the same starvation
    # problem the node itself had with too few RPC threads.
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    # Localhost only. The tunnel connects from this same machine; nothing else
    # can reach this port even if the firewall were misconfigured.
    with Server(("127.0.0.1", PORT), Handler) as srv:
        print(f"divi rpc proxy on 127.0.0.1:{PORT} -> {RPC_URL}", flush=True)
        srv.serve_forever()
