#!/usr/bin/env python3
"""Who won each block, aggregated per day.

Neither earlier pass recorded this: chain-scan read every coinstake but stored
only its outputs, losing the block-to-winner link, and chart-scan never opened
transactions at all. So this is a third pass — one extra transaction fetch per
block on top of the header.

Winner = the address the reward is PAID TO. For a vault that is the owner, not
the delegate who did the staking work, which matches how balances and the rich
list attribute vaulted coins everywhere else on the site. Counting the delegate
would make a handful of staking services look like thousands of winners.

Stored as (day, address, wins) so "distinct wallets that won that day" is a
COUNT and "how often did this address win" is available too.

Resumable: the last completed height is committed as it goes.
"""

import base64
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

RPC_URL = os.environ.get("DIVI_RPC_URL", "http://127.0.0.1:51473/")
RPC_USER = os.environ.get("DIVI_RPC_USER", "")
RPC_PASS = os.environ.get("DIVI_RPC_PASS", "")
DB_PATH = os.environ.get("SCAN_DB", "/var/lib/divi-scan/divi-index.sqlite")

BATCH = 800
WORKERS = 16  # matches the node's rpcthreads; more just queues
_auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()


class RpcError(RuntimeError):
    pass


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "1.0", "id": "stake", "method": method, "params": params or []})
    req = urllib.request.Request(
        RPC_URL, data=body.encode(),
        headers={"content-type": "application/json", "authorization": f"Basic {_auth}"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.load(r)
        except urllib.error.HTTPError as e:
            try:
                out = json.load(e)
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(1 + attempt * 2)
                continue
        except Exception:
            if attempt == 4:
                raise
            time.sleep(1 + attempt * 2)
            continue
        if out.get("error"):
            raise RpcError(str((out["error"] or {}).get("message", out["error"])))
        return out["result"]


def setup(db):
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS stake_day (
            day TEXT NOT NULL,
            address TEXT NOT NULL,
            wins INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, address)
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS stake_day_day ON stake_day(day);
        CREATE TABLE IF NOT EXISTS chartmeta (key TEXT PRIMARY KEY, value TEXT);
        """
    )
    db.commit()


def winner_of(height):
    """(day, winner address) for a block, or None when it isn't a stake block."""
    b = rpc("getblock", [rpc("getblockhash", [height])])
    txs = b.get("tx") or []
    day = datetime.fromtimestamp(b["time"], timezone.utc).strftime("%Y-%m-%d")
    if len(txs) < 2:
        return day, None  # proof-of-work era: no coinstake
    try:
        cs = rpc("getrawtransaction", [txs[1], 1])
    except RpcError:
        return day, None
    vout = cs.get("vout") or []
    # A coinstake is marked by an empty first output; anything else is a plain
    # transaction and this block simply had no stake.
    if not vout or vout[0].get("value") != 0:
        return day, None
    for o in vout[1:]:
        addrs = (o.get("scriptPubKey") or {}).get("addresses") or []
        if addrs and (o.get("value") or 0) > 0:
            return day, addrs[0]  # owner first, as everywhere else
    return day, None


def main():
    if not RPC_USER:
        sys.exit("DIVI_RPC_USER / DIVI_RPC_PASS must be set")
    db = sqlite3.connect(DB_PATH)
    setup(db)

    tip = rpc("getblockcount")
    cap = os.environ.get("SCAN_MAX_HEIGHT")
    if cap:
        tip = min(tip, int(cap))
    row = db.execute("SELECT value FROM chartmeta WHERE key='stake_height'").fetchone()
    start = (int(row[0]) + 1) if row else 0
    if start > tip:
        print(f"stake winners already current at {tip:,}")
        return
    print(f"scanning stake winners {start:,} -> {tip:,}", flush=True)

    t0 = time.time()
    height = start
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        while height <= tip:
            hi = min(height + BATCH - 1, tip)
            for day, addr in pool.map(winner_of, range(height, hi + 1)):
                if not addr:
                    continue
                db.execute(
                    "INSERT INTO stake_day(day,address,wins) VALUES(?,?,1) "
                    "ON CONFLICT(day,address) DO UPDATE SET wins = wins + 1",
                    (day, addr),
                )
            db.execute(
                "INSERT INTO chartmeta(key,value) VALUES('stake_height',?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(hi),))
            db.commit()
            height = hi + 1
            rate = (height - start) / max(1e-9, time.time() - t0)
            print(f"  {hi:,}/{tip:,}  {rate:,.0f} blk/s  eta {(tip-hi)/max(rate,1)/3600:.1f}h", flush=True)

    print(f"stake winners done in {(time.time()-t0)/3600:.2f}h", flush=True)
    n = db.execute("SELECT COUNT(DISTINCT address) FROM stake_day").fetchone()[0]
    print(f"  distinct winners ever: {n:,}")


if __name__ == "__main__":
    main()
