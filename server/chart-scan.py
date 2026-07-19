#!/usr/bin/env python3
"""Daily time-series for the charts.

Deliberately separate from chain-scan.py and far cheaper: everything here comes
from the block header, so it needs one `getblock` per block and never touches
individual transactions. That is roughly an order of magnitude less work.

Per day we record block count, transaction count, real (non-stake) payments,
money supply and difficulty. Divi blocks always carry a coinbase and a coinstake,
so payments = transactions - 2 per block; that identity was confirmed against the
full scan, where 4,131,279 x 2 + 931,063 payments reconciled exactly to the
9,193,559 transactions counted transaction-by-transaction.

Wallet growth is NOT computed here — chain-scan.py already records the height at
which each address first appeared, so it comes from joining that against the
height-to-date mapping this builds.
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
from decimal import Decimal

RPC_URL = os.environ.get("DIVI_RPC_URL", "http://127.0.0.1:51473/")
RPC_USER = os.environ.get("DIVI_RPC_USER", "")
RPC_PASS = os.environ.get("DIVI_RPC_PASS", "")
DB_PATH = os.environ.get("SCAN_DB", "/var/lib/divi-scan/divi-index.sqlite")

BATCH = 2000
WORKERS = 12
_auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()


class RpcError(RuntimeError):
    pass


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "1.0", "id": "chart", "method": method, "params": params or []})
    req = urllib.request.Request(
        RPC_URL, data=body.encode(),
        headers={"content-type": "application/json", "authorization": f"Basic {_auth}"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.load(r, parse_float=Decimal)
        except urllib.error.HTTPError as e:
            try:
                out = json.load(e, parse_float=Decimal)
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
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS daily (
            day TEXT PRIMARY KEY,          -- YYYY-MM-DD (UTC)
            blocks INTEGER DEFAULT 0,
            txs INTEGER DEFAULT 0,
            payments INTEGER DEFAULT 0,    -- excludes coinbase + coinstake
            supply INTEGER,                -- money supply at the last block of the day
            difficulty REAL,               -- at the last block of the day
            last_height INTEGER
        ) WITHOUT ROWID;
        -- Maps a height to its day so address first-seen heights become dates.
        CREATE TABLE IF NOT EXISTS height_day (
            height INTEGER PRIMARY KEY, day TEXT
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS height_day_day ON height_day(day);
        CREATE TABLE IF NOT EXISTS chartmeta (key TEXT PRIMARY KEY, value TEXT);
        """
    )
    db.commit()


def head(height):
    b = rpc("getblock", [rpc("getblockhash", [height])])
    return (
        height,
        b["time"],
        len(b.get("tx") or []),
        b.get("moneysupply"),
        b.get("difficulty"),
    )


def main():
    if not RPC_USER:
        sys.exit("DIVI_RPC_USER / DIVI_RPC_PASS must be set")
    db = sqlite3.connect(DB_PATH)
    setup(db)

    tip = rpc("getblockcount")
    row = db.execute("SELECT value FROM chartmeta WHERE key='height'").fetchone()
    start = (int(row[0]) + 1) if row else 0
    if start > tip:
        print(f"charts already current at {tip}")
        return
    print(f"charting {start:,} -> {tip:,}", flush=True)

    t0 = time.time()
    height = start
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        while height <= tip:
            hi = min(height + BATCH - 1, tip)
            rows = sorted(pool.map(head, range(height, hi + 1)), key=lambda x: x[0])

            for h, t, ntx, supply, diff in rows:
                day = datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d")
                # Every block carries a coinbase and a coinstake; the rest are
                # real payments. Negative is impossible but guarded anyway.
                payments = max(0, ntx - 2)
                sup = int(Decimal(supply) * (Decimal(10) ** 8)) if supply is not None else None
                db.execute(
                    """INSERT INTO daily(day,blocks,txs,payments,supply,difficulty,last_height)
                       VALUES(?,1,?,?,?,?,?)
                       ON CONFLICT(day) DO UPDATE SET
                         blocks=blocks+1, txs=txs+excluded.txs, payments=payments+excluded.payments,
                         supply=COALESCE(excluded.supply,supply),
                         difficulty=COALESCE(excluded.difficulty,difficulty),
                         last_height=excluded.last_height""",
                    (day, ntx, payments, sup, float(diff) if diff is not None else None, h),
                )
                db.execute("INSERT OR REPLACE INTO height_day(height,day) VALUES(?,?)", (h, day))

            db.execute(
                "INSERT INTO chartmeta(key,value) VALUES('height',?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(hi),))
            db.commit()
            height = hi + 1
            done = height - start
            rate = done / max(1e-9, time.time() - t0)
            print(f"  {hi:,}/{tip:,}  {rate:,.0f} blk/s  eta {(tip-hi)/max(rate,1)/3600:.1f}h", flush=True)

    print(f"charts done in {(time.time()-t0)/3600:.2f}h", flush=True)


if __name__ == "__main__":
    main()
