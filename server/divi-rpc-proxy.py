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
import threading
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
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
    # Node-level views. getpeerinfo exposes who we're connected to, which is
    # public P2P information, but see the cache note below.
    "getchaintips",
    "getpeerinfo",
    "getinfo",
}

# Methods that are EXPENSIVE on the node and must never be driven by request
# volume. getchaintips walks the fork set and stalls block processing for
# ~18 seconds; unthrottled, a public endpoint would let anyone halt the node.
# These are answered from a server-side cache and refreshed at most this often.
SLOW_METHODS = {"getpeerinfo": 20, "getinfo": 10}

# getchaintips is in a class of its own: it walks the entire fork set and stalls
# the node's RPC threads for ~18 seconds. Even once per request-burst that is
# enough to make the node unresponsive - which it demonstrably did. So it is
# NEVER called from a web request. A separate scheduled job refreshes this file
# and the proxy only ever reads it.
CHAINTIPS_FILE = "/var/lib/divi-scan/chaintips.json"

# getinfo mixes node facts with WALLET facts — balance, wallet version, key pool
# and unlock state all come back in the same object. Only these fields ever
# leave this process. A whitelist, not a blacklist: a future Divi release adding
# another wallet field must not silently start publishing it.
GETINFO_PUBLIC = {
    "version", "protocolversion", "blocks", "timeoffset", "connections",
    "difficulty", "testnet", "relayfee", "errors", "moneysupply",
}


def scrub(method, result):
    """Strip anything from a response that isn't ours to publish."""
    if method == "getinfo" and isinstance(result, dict):
        return {k: v for k, v in result.items() if k in GETINFO_PUBLIC}
    if method == "getpeerinfo" and isinstance(result, list):
        # Peer addresses are public P2P data, but there is no reason to publish
        # our own byte counters and internal connection bookkeeping.
        keep = {"addr", "subver", "inbound", "pingtime", "conntime", "startingheight"}
        return [{k: v for k, v in (p or {}).items() if k in keep} for p in result]
    return result
_slow_cache = {}
_slow_lock = threading.Lock()

# Synthetic methods handled here rather than forwarded. A block list of 1000
# rows would otherwise be ~2000 separate round trips from the browser; batching
# it here turns that into one request and keeps the fan-out on the loopback
# interface next to the node.
BATCH_METHODS = {"scan_blockrange"}

# Bounded so a crafted request cannot ask for the whole chain in one go.
MAX_RANGE = 1000
RANGE_WORKERS = 8

RPC_URL = os.environ.get("DIVI_RPC_URL", "http://127.0.0.1:51473/")
RPC_USER = os.environ.get("DIVI_RPC_USER", "")
RPC_PASS = os.environ.get("DIVI_RPC_PASS", "")
SHARED_SECRET = os.environ.get("SCAN_SHARED_SECRET", "")
PORT = int(os.environ.get("PROXY_PORT", "5174"))

# A request body large enough to be interesting is a request body large enough
# to be an attack.
MAX_BODY = 8192
RPC_TIMEOUT = 20
# getchaintips genuinely takes ~18s, so the normal timeout would always beat it.
SLOW_TIMEOUT = 90

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

        if method in BATCH_METHODS:
            try:
                return self._send(200, {"result": block_range(*params)})
            except ValueError:
                return self._send(400, {"error": "Malformed request."})
            except Exception:
                return self._send(503, {"error": "The Divi node is not responding right now."})

        if method not in ALLOWED:
            return self._send(403, {"error": "Unsupported query."})

        if method == "getchaintips":
            try:
                with open(CHAINTIPS_FILE) as f:
                    snap = json.load(f)
                return self._send(200, {"result": snap.get("tips", [])})
            except Exception:
                return self._send(
                    503, {"error": "Fork data hasn't been collected yet. It refreshes hourly."}
                )

        if method in SLOW_METHODS:
            try:
                return self._send(200, {"result": cached_slow(method, params)})
            except RpcError as e:
                return self._send(e.status, {"error": str(e)})

        try:
            self._send(200, {"result": rpc(method, params)})
        except RpcError as e:
            self._send(e.status, {"error": str(e)})


class RpcError(Exception):
    def __init__(self, message, status=404):
        super().__init__(message)
        self.status = status


def rpc(method, params, timeout=None):
    """One JSON-RPC round trip to the node. Raises RpcError on any failure."""
    payload = json.dumps({"jsonrpc": "1.0", "id": "scan", "method": method, "params": params})
    auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()
    rq = urllib.request.Request(
        RPC_URL,
        data=payload.encode(),
        headers={"content-type": "application/json", "authorization": f"Basic {auth}"},
    )
    try:
        with urllib.request.urlopen(rq, timeout=timeout or RPC_TIMEOUT) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        # The node answers RPC-level errors with a 500 and a JSON body; pass the
        # message through, since these are user-meaningful.
        try:
            out = json.load(e)
        except Exception:
            raise RpcError("The Divi node rejected that query.", 502)
    except Exception:
        raise RpcError("The Divi node is not responding right now.", 503)

    if out.get("error"):
        raise RpcError((out["error"] or {}).get("message", "Query failed."), 404)
    return out.get("result")


def cached_slow(method, params):
    """Answer an expensive call from cache, refreshing at most once per TTL.

    The lock matters: without it a burst of simultaneous requests would each
    start their own 18-second getchaintips, which is precisely the stall this
    exists to prevent.
    """
    ttl = SLOW_METHODS[method]
    key = (method, json.dumps(params, sort_keys=True))
    now = time.monotonic()
    with _slow_lock:
        hit = _slow_cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
        value = scrub(method, rpc(method, params, timeout=SLOW_TIMEOUT))
        _slow_cache[key] = (now, value)
        return value


def block_range(start, count):
    """Compact summaries for `count` blocks ending at height `start`, newest first.

    Only the fields a list view actually shows — deliberately not the coinstake
    analysis, which would multiply the round trips and is only needed on a
    block's own page.
    """
    start = int(start)
    count = max(1, min(int(count), MAX_RANGE))
    heights = [h for h in range(start, start - count, -1) if h >= 0]

    def one(h):
        b = rpc("getblock", [rpc("getblockhash", [h])])
        return {
            "height": b["height"],
            "hash": b["hash"],
            "time": b["time"],
            "txCount": len(b.get("tx") or []),
            "size": b.get("size"),
        }

    with ThreadPoolExecutor(max_workers=RANGE_WORKERS) as pool:
        blocks = list(pool.map(one, heights))
    return blocks


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
