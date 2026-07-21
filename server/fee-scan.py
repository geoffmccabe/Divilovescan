#!/usr/bin/env python3
"""Fees burned per day.

Divi DESTROYS transaction fees rather than paying them to the staker (verified:
BlockConnectionService.cpp, "PoS stage destroys fees"). So a fee is a small
permanent removal from supply, and this measures it.

The cheap identity that makes this a HEADER-ONLY scan:

    supply_growth(block) = subsidy(block) - fees_burned(block)
    => fees_burned(block) = subsidy(block) - supply_growth(block)

`supply_growth` is just the moneysupply delta between consecutive block headers —
no transaction lookups. `subsidy` is the block reward, which depends only on
height, not on the block's transactions. On the ~78% of blocks that carry no
payments, fees are zero, so subsidy == supply_growth EXACTLY. We read the
subsidy off those clean blocks and carry it forward; the reward schedule changes
far more slowly than clean blocks occur, so a payment block's subsidy is always
known from a recent clean neighbour.

That makes the whole thing one getblock per block and nothing else.

Honest expectation: the all-time total is tens of DIVI. Divi's fees are
minuscule by design; this metric will mostly read zero with rare tiny spikes.
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

BATCH = 1000
WORKERS = 6  # leave the node's other RPC threads for the live site
SATS = Decimal(10) ** 8
_auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "1.0", "id": "fee", "method": method, "params": params or []})
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
            raise RuntimeError(out["error"])
        return out["result"]


def setup(db):
    cols = [c[1] for c in db.execute("PRAGMA table_info(daily)")]
    if "fees_burned" not in cols:
        db.execute("ALTER TABLE daily ADD COLUMN fees_burned INTEGER")
    db.execute(
        "CREATE TABLE IF NOT EXISTS chartmeta (key TEXT PRIMARY KEY, value TEXT)"
    )
    db.commit()


def header(height):
    b = rpc("getblock", [rpc("getblockhash", [height])])
    supply = int(Decimal(b["moneysupply"]) * SATS) if b.get("moneysupply") is not None else None
    return {
        "h": b["height"],
        "time": b["time"],
        "txs": len(b.get("tx") or []),
        "supply": supply,
    }


def main():
    if not RPC_USER:
        sys.exit("DIVI_RPC_USER / DIVI_RPC_PASS must be set")
    db = sqlite3.connect(DB_PATH)
    setup(db)

    tip = rpc("getblockcount")
    cap = os.environ.get("SCAN_MAX_HEIGHT")
    if cap:
        tip = min(tip, int(cap))

    row = db.execute("SELECT value FROM chartmeta WHERE key='fee_height'").fetchone()
    start = (int(row[0]) + 1) if row else 1  # height 0 has no predecessor supply
    prev_supply_row = db.execute("SELECT value FROM chartmeta WHERE key='fee_prev_supply'").fetchone()
    prev_supply = int(prev_supply_row[0]) if prev_supply_row else None
    subsidy_row = db.execute("SELECT value FROM chartmeta WHERE key='fee_subsidy'").fetchone()
    subsidy = int(subsidy_row[0]) if subsidy_row else 0

    if start > tip:
        print(f"fees already current at {tip:,}")
        return
    print(f"scanning fees {start:,} -> {tip:,}", flush=True)

    # Accumulate per day in memory, flush per batch.
    day_fees = {}
    t0 = time.time()
    height = start
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        while height <= tip:
            hi = min(height + BATCH - 1, tip)
            rows = sorted(pool.map(header, range(height, hi + 1)), key=lambda r: r["h"])

            for r in rows:
                if r["supply"] is None or prev_supply is None:
                    prev_supply = r["supply"]
                    continue
                growth = r["supply"] - prev_supply
                prev_supply = r["supply"]

                if r["txs"] <= 2:
                    # Clean block: no payments, so fees are zero and this growth
                    # IS the current subsidy. Record it and carry it forward.
                    if growth > 0:
                        subsidy = growth
                    continue

                # Payment block: fee = subsidy - growth, floored at zero (a
                # schedule change landing exactly here could otherwise go
                # slightly negative).
                fee = max(0, subsidy - growth)
                if fee:
                    day = datetime.fromtimestamp(r["time"], timezone.utc).strftime("%Y-%m-%d")
                    day_fees[day] = day_fees.get(day, 0) + fee

            # Flush this batch's day totals.
            for day, amt in day_fees.items():
                db.execute(
                    "UPDATE daily SET fees_burned = COALESCE(fees_burned, 0) + ? WHERE day = ?",
                    (amt, day),
                )
            day_fees.clear()

            db.execute("INSERT OR REPLACE INTO chartmeta VALUES('fee_height', ?)", (str(hi),))
            db.execute("INSERT OR REPLACE INTO chartmeta VALUES('fee_prev_supply', ?)", (str(prev_supply),))
            db.execute("INSERT OR REPLACE INTO chartmeta VALUES('fee_subsidy', ?)", (str(subsidy),))
            db.commit()

            height = hi + 1
            rate = (height - start) / max(1e-9, time.time() - t0)
            print(f"  {hi:,}/{tip:,}  {rate:,.0f} blk/s  eta {(tip-hi)/max(rate,1)/3600:.1f}h", flush=True)

    total = db.execute("SELECT COALESCE(SUM(fees_burned),0) FROM daily").fetchone()[0]
    db.execute("INSERT OR REPLACE INTO chartmeta VALUES('fee_total', ?)", (str(total),))
    db.execute(
        "INSERT INTO meta(key,value) VALUES('fees_burned_total', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(total),)
    )
    db.commit()
    print(f"done in {(time.time()-t0)/3600:.2f}h  —  fees burned all-time: {total/1e8:,.8f} DIVI")


if __name__ == "__main__":
    main()
