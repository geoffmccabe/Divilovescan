#!/usr/bin/env python3
"""Build the aggregate index the Divi node cannot provide.

The node's own address index answers "tell me about THIS address" but can never
answer "rank every address", and — critically — it ignores Divi's `vault` script
type entirely. Vaults carry ~76% of all staking value, so anything built on the
node index alone would report zero for most real holders.

So we walk the chain ourselves and maintain a UTXO set keyed by address:

    outputs arrive  -> insert  (txid, n) -> address, value
    inputs spend    -> delete  (txid, n), and note the address has sent

Balances are then just a SUM over what's left. Storing the UTXO set rather than
every output that ever existed keeps the table to a few million rows instead of
tens of millions.

Vault outputs name two parties: the owner (may spend freely) and the delegated
staker (may only stake, never take). Value is attributed to the OWNER, which is
whose coins they actually are. The node lists the owner first — the free-spend
branch of the script — and we take addresses[0].

Designed to be interrupted: progress is committed periodically with the last
completed height, so re-running resumes rather than restarting.
"""

import base64
import json
from decimal import Decimal
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RPC_URL = os.environ.get("DIVI_RPC_URL", "http://127.0.0.1:51473/")
RPC_USER = os.environ.get("DIVI_RPC_USER", "")
RPC_PASS = os.environ.get("DIVI_RPC_PASS", "")
DB_PATH = os.environ.get("SCAN_DB", "/root/divi-index.sqlite")

# Blocks fetched concurrently, then applied strictly in height order — spend
# tracking is order-dependent, so only the fetching is parallel.
BATCH = 400
WORKERS = 12
COMMIT_EVERY = 20_000  # blocks
SATS = Decimal(10) ** 8

class RpcError(RuntimeError):
    """An answer from the node, not a transport failure — never worth retrying."""


_auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "1.0", "id": "scan", "method": method, "params": params or []})
    req = urllib.request.Request(
        RPC_URL,
        data=body.encode(),
        headers={"content-type": "application/json", "authorization": f"Basic {_auth}"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.load(r, parse_float=Decimal)
        except urllib.error.HTTPError as e:
            # The node answers RPC-level errors with a 500 and a JSON body. Those
            # are answers, not transport failures — retrying them is pointless.
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
        CREATE TABLE IF NOT EXISTS utxo (
            txid TEXT NOT NULL, n INTEGER NOT NULL,
            address TEXT, value INTEGER NOT NULL,
            PRIMARY KEY (txid, n)
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS utxo_addr ON utxo(address);
        -- every address ever seen, and whether it has ever spent
        CREATE TABLE IF NOT EXISTS addr (
            address TEXT PRIMARY KEY,
            first_height INTEGER,
            has_sent INTEGER DEFAULT 0
        ) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
        """
    )
    db.commit()


def get_meta(db, key, default=None):
    row = db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def set_meta(db, key, value):
    db.execute("INSERT INTO meta(key,value) VALUES(?,?) "
               "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


def address_of(spk):
    """Owner address for an output, or None if it pays no address.

    Vaults list [owner, staker]; the owner holds the coins. Multisig lists
    several — the first is taken, which is a simplification we accept rather
    than inventing shared-ownership semantics.
    """
    addrs = spk.get("addresses") or []
    return addrs[0] if addrs else None


def fetch_block(height):
    b = rpc("getblock", [rpc("getblockhash", [height])])
    txs = []
    for t in b.get("tx") or []:
        try:
            txs.append(rpc("getrawtransaction", [t, 1]))
        except RpcError:
            # The genesis coinbase is unretrievable by design, and a handful of
            # very early transactions can be too. Skipping is correct: those
            # outputs were never spendable, so they belong in no balance.
            continue
    return height, b, txs


def main():
    if not RPC_USER:
        sys.exit("DIVI_RPC_USER / DIVI_RPC_PASS must be set")

    db = sqlite3.connect(DB_PATH)
    setup(db)

    tip = rpc("getblockcount")
    # Lets a short range be scanned into a throwaway database to check the logic
    # before committing to a run measured in hours.
    cap = os.environ.get("SCAN_MAX_HEIGHT")
    if cap:
        tip = min(tip, int(cap))
    start = int(get_meta(db, "height", -1)) + 1
    if start > tip:
        print(f"already up to date at {tip}")
        return
    print(f"scanning {start:,} -> {tip:,} ({tip - start + 1:,} blocks)", flush=True)

    t0 = time.time()
    stats = {
        "tx_total": int(get_meta(db, "tx_total", 0)),
        "tx_nonstake": int(get_meta(db, "tx_nonstake", 0)),
    }

    height = start
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        while height <= tip:
            hi = min(height + BATCH - 1, tip)
            # Fetched concurrently, applied in order.
            got = sorted(pool.map(fetch_block, range(height, hi + 1)), key=lambda x: x[0])

            for h, blk, txs in got:
                for i, tx in enumerate(txs):
                    stats["tx_total"] += 1
                    vout = tx.get("vout") or []
                    # A coinstake is marked by an empty first output; index 0 is
                    # the coinbase. Neither is a user-sent payment.
                    is_coinbase = i == 0
                    is_coinstake = bool(vout) and vout[0].get("value") == 0
                    if not is_coinbase and not is_coinstake:
                        stats["tx_nonstake"] += 1

                    # Spend inputs first so a same-block spend behaves correctly.
                    for vin in tx.get("vin") or []:
                        ptx, pn = vin.get("txid"), vin.get("vout")
                        if ptx is None:
                            continue  # generated coins
                        row = db.execute(
                            "SELECT address FROM utxo WHERE txid=? AND n=?", (ptx, pn)
                        ).fetchone()
                        if row:
                            if row[0]:
                                db.execute("UPDATE addr SET has_sent=1 WHERE address=?", (row[0],))
                            db.execute("DELETE FROM utxo WHERE txid=? AND n=?", (ptx, pn))

                    for o in vout:
                        # Exact: Decimal * 10^8, never float arithmetic.
                        val = int(Decimal(o.get("value") or 0) * SATS)
                        if val <= 0:
                            continue
                        addr = address_of(o.get("scriptPubKey") or {})
                        db.execute(
                            "INSERT OR REPLACE INTO utxo(txid,n,address,value) VALUES(?,?,?,?)",
                            (tx["txid"], o.get("n"), addr, val),
                        )
                        if addr:
                            db.execute(
                                "INSERT INTO addr(address,first_height) VALUES(?,?) "
                                "ON CONFLICT(address) DO NOTHING",
                                (addr, h),
                            )

            height = hi + 1
            if (height - start) % COMMIT_EVERY < BATCH or height > tip:
                set_meta(db, "height", hi)
                for k, v in stats.items():
                    set_meta(db, k, v)
                db.commit()
                done = height - start
                rate = done / max(1e-9, time.time() - t0)
                left = (tip - hi) / rate if rate else 0
                print(
                    f"  {hi:,}/{tip:,}  {rate:,.0f} blk/s  eta {left/3600:.1f}h",
                    flush=True,
                )

    set_meta(db, "height", tip)
    for k, v in stats.items():
        set_meta(db, k, v)
    set_meta(db, "completed_at", int(time.time()))
    db.commit()
    print(f"done in {(time.time()-t0)/3600:.2f}h", flush=True)


if __name__ == "__main__":
    main()
