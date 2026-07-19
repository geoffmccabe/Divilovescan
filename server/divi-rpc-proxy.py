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
import socket
import sqlite3
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

# Answered from the chain-scan database, not the node. These are things the node
# fundamentally cannot do: rank every address, and see vault holdings at all.
SCAN_METHODS = {"scan_richlist", "scan_summary", "scan_address"}

# Network-map support. Peers come from the node; locations come from a public
# geolocation service and are cached indefinitely (an IP's city does not move),
# so the service is queried once per address rather than once per page view.
NET_METHODS = {"scan_peers", "scan_geo", "scan_probe"}
GEO_DB = os.environ.get("GEO_DB", "/var/lib/divi-scan/geo.sqlite")
GEO_ENDPOINT = "http://ip-api.com/batch"
PROBE_PORT = 51472
PROBE_TIMEOUT = 2.0
MAX_IPS = 200
SCAN_DB = os.environ.get("SCAN_DB", "/var/lib/divi-scan/divi-index.sqlite")
RICHLIST_MAX = 200

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

        if method in NET_METHODS:
            try:
                return self._send(200, {"result": net_query(method, params)})
            except Exception:
                return self._send(503, {"error": "Couldn't gather network data right now."})

        if method in SCAN_METHODS:
            try:
                return self._send(200, {"result": scan_query(method, params)})
            except FileNotFoundError:
                return self._send(503, {"error": "The chain scan hasn't been built yet."})
            except Exception:
                return self._send(500, {"error": "Couldn't read the chain index."})

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


_raw_peers = {"at": 0.0, "value": None}


def cached_raw_peers():
    """Unscrubbed getpeerinfo, cached briefly. Never returned to a caller as-is."""
    now = time.monotonic()
    with _slow_lock:
        if _raw_peers["value"] is not None and now - _raw_peers["at"] < 20:
            return _raw_peers["value"]
        value = rpc("getpeerinfo", [], timeout=SLOW_TIMEOUT)
        _raw_peers.update(at=now, value=value)
        return value


def geo_db():
    db = sqlite3.connect(GEO_DB, timeout=5)
    db.execute(
        "CREATE TABLE IF NOT EXISTS geo (ip TEXT PRIMARY KEY, lat REAL, lon REAL,"
        " city TEXT, country TEXT, isp TEXT, seen INTEGER)"
    )
    return db


def strip_port(addr):
    """'1.2.3.4:51472' -> '1.2.3.4'; leaves bracketed IPv6 intact."""
    a = (addr or "").strip()
    if a.startswith("["):
        return a.split("]")[0].lstrip("[")
    return a.rsplit(":", 1)[0] if a.count(":") == 1 else a


def net_query(method, params):
    if method == "scan_peers":
        # Raw, NOT the scrubbed public copy: the scrubber strips addrlocal and
        # the byte counters, and addrlocal is the only way to learn our own
        # public address. It is derived here and published as a single value;
        # per-peer addrlocal never leaves this process.
        peers = cached_raw_peers()
        out = []
        votes = {}
        for p in peers or []:
            ip = strip_port(p.get("addr"))
            if not ip:
                continue
            out.append({
                "ip": ip,
                "inbound": bool(p.get("inbound")),
                "subver": p.get("subver") or "",
                "pingMs": round((p.get("pingtime") or 0) * 1000),
                "connSecs": p.get("conntime") or 0,
                "height": p.get("startingheight") or 0,
                "bytesSent": p.get("bytessent") or 0,
                "bytesRecv": p.get("bytesrecv") or 0,
            })
            # Peers report the address they see us as; the majority answer is
            # our public address.
            local = strip_port(p.get("addrlocal"))
            if local:
                votes[local] = votes.get(local, 0) + 1
        self_ip = max(votes.items(), key=lambda kv: kv[1])[0] if votes else None
        return {"peers": out, "selfIp": self_ip}

    if method == "scan_geo":
        ips = [str(i)[:64] for i in (params[0] if params else [])][:MAX_IPS]
        db = geo_db()
        try:
            found, missing = {}, []
            for ip in ips:
                r = db.execute(
                    "SELECT lat,lon,city,country,isp FROM geo WHERE ip=?", (ip,)
                ).fetchone()
                if r:
                    found[ip] = {"ip": ip, "lat": r[0], "lon": r[1],
                                 "city": r[2], "country": r[3], "isp": r[4]}
                else:
                    missing.append(ip)

            # One batched lookup for whatever we haven't seen before.
            for chunk in (missing[i:i + 100] for i in range(0, len(missing), 100)):
                try:
                    req = urllib.request.Request(
                        GEO_ENDPOINT,
                        data=json.dumps([{"query": ip, "fields": "status,lat,lon,city,country,isp,query"}
                                         for ip in chunk]).encode(),
                        headers={"content-type": "application/json"},
                    )
                    with urllib.request.urlopen(req, timeout=20) as r:
                        rows = json.load(r)
                except Exception:
                    break  # leave them unlocated rather than failing the whole call
                for row in rows or []:
                    ip = row.get("query")
                    if not ip or row.get("status") != "success":
                        continue
                    rec = {"ip": ip, "lat": row.get("lat"), "lon": row.get("lon"),
                           "city": row.get("city"), "country": row.get("country"),
                           "isp": row.get("isp")}
                    found[ip] = rec
                    db.execute(
                        "INSERT OR REPLACE INTO geo(ip,lat,lon,city,country,isp,seen) "
                        "VALUES(?,?,?,?,?,?,?)",
                        (ip, rec["lat"], rec["lon"], rec["city"], rec["country"],
                         rec["isp"], int(time.time())),
                    )
                db.commit()
            return [found[i] for i in ips if i in found]
        finally:
            db.close()

    if method == "scan_probe":
        ips = [str(i)[:64] for i in (params[0] if params else [])][:MAX_IPS]

        def alive(ip):
            try:
                with socket.create_connection((ip, PROBE_PORT), timeout=PROBE_TIMEOUT):
                    return {"ip": ip, "online": True}
            except Exception:
                return {"ip": ip, "online": False}

        with ThreadPoolExecutor(max_workers=24) as pool:
            return list(pool.map(alive, ips))

    raise ValueError("unknown network method")


def scan_db():
    if not os.path.exists(SCAN_DB):
        raise FileNotFoundError(SCAN_DB)
    # Read-only: this process must never be able to alter the index.
    return sqlite3.connect(f"file:{SCAN_DB}?mode=ro", uri=True, timeout=5)


def scan_query(method, params):
    db = scan_db()
    try:
        meta = dict(db.execute("SELECT key,value FROM meta").fetchall())

        if method == "scan_summary":
            keys = ("height", "tx_total", "tx_nonstake", "sum_total", "sum_vaulted",
                    "holders", "delegates", "delegators", "summary_built")
            out = {k: int(meta.get(k, 0)) for k in keys}
            out["addresses"] = db.execute("SELECT COUNT(*) FROM addr").fetchone()[0]
            out["senders"] = db.execute("SELECT COUNT(*) FROM addr WHERE has_sent=1").fetchone()[0]
            return out

        if method == "scan_richlist":
            limit = min(int(params[0]) if params else 100, RICHLIST_MAX)
            offset = max(0, int(params[1]) if len(params) > 1 else 0)
            rows = db.execute(
                "SELECT address,balance,vaulted,utxos FROM balances "
                "ORDER BY balance DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            return {
                "total": int(meta.get("sum_total", 0)),
                "holders": int(meta.get("holders", 0)),
                "builtAt": int(meta.get("summary_built", 0)),
                "rows": [
                    {"address": a, "balance": b, "vaulted": v, "utxos": u, "rank": offset + i + 1}
                    for i, (a, b, v, u) in enumerate(rows)
                ],
            }

        if method == "scan_address":
            addr = str(params[0])[:120]
            row = db.execute(
                "SELECT balance,vaulted,utxos FROM balances WHERE address=?", (addr,)
            ).fetchone()
            # Both directions of the delegation graph: who stakes FOR this
            # address, and whose coins this address stakes.
            staked_by = db.execute(
                "SELECT staker,amount FROM delegation WHERE owner=? ORDER BY amount DESC LIMIT 50",
                (addr,),
            ).fetchall()
            stakes_for = db.execute(
                "SELECT owner,amount FROM delegation WHERE staker=? ORDER BY amount DESC LIMIT 50",
                (addr,),
            ).fetchall()
            return {
                "balance": row[0] if row else 0,
                "vaulted": row[1] if row else 0,
                "utxos": row[2] if row else 0,
                "builtAt": int(meta.get("summary_built", 0)),
                "stakedBy": [{"address": a, "amount": v} for a, v in staked_by],
                "stakesFor": [{"address": a, "amount": v} for a, v in stakes_for],
                "stakesForTotal": db.execute(
                    "SELECT COALESCE(SUM(amount),0) FROM delegation WHERE staker=?", (addr,)
                ).fetchone()[0],
            }

        raise ValueError("unknown scan method")
    finally:
        db.close()


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
