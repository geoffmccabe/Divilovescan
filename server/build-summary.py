#!/usr/bin/env python3
"""Roll the raw UTXO set up into the tables the site actually queries.

Grouping 390k UTXOs by address takes ~3 seconds. That's fine once, and far too
slow to do per page view, so the answers are materialised here and served
straight out of an index afterwards.

Rebuilt after each scan top-up. Cheap enough (seconds) that incremental
maintenance isn't worth the extra failure modes.
"""

import os
import sqlite3
import sys
import time

DB = os.environ.get("SCAN_DB", "/var/lib/divi-scan/divi-index.sqlite")


def main():
    db = sqlite3.connect(DB)
    t0 = time.time()

    db.executescript(
        """
        DROP TABLE IF EXISTS balances;
        CREATE TABLE balances (
            address TEXT PRIMARY KEY,
            balance INTEGER NOT NULL,   -- everything the owner controls
            vaulted INTEGER NOT NULL,   -- the part staked via a delegate
            utxos   INTEGER NOT NULL
        ) WITHOUT ROWID;

        DROP TABLE IF EXISTS delegation;
        CREATE TABLE delegation (
            owner  TEXT NOT NULL,
            staker TEXT NOT NULL,
            amount INTEGER NOT NULL,
            utxos  INTEGER NOT NULL,
            PRIMARY KEY (owner, staker)
        ) WITHOUT ROWID;
        """
    )

    db.execute(
        """
        INSERT INTO balances(address, balance, vaulted, utxos)
        SELECT address,
               SUM(value),
               SUM(CASE WHEN staker IS NOT NULL THEN value ELSE 0 END),
               COUNT(*)
        FROM utxo WHERE address IS NOT NULL GROUP BY address
        """
    )
    # Ranking index: the rich list is ordered by balance, so let SQLite walk it
    # in order instead of sorting 390k rows on every request.
    db.execute("CREATE INDEX balances_rank ON balances(balance DESC)")

    db.execute(
        """
        INSERT INTO delegation(owner, staker, amount, utxos)
        SELECT address, staker, SUM(value), COUNT(*)
        FROM utxo WHERE staker IS NOT NULL AND address IS NOT NULL
        GROUP BY address, staker
        """
    )
    db.execute("CREATE INDEX delegation_staker ON delegation(staker)")

    # Headline totals, so the stats page is a handful of key reads.
    def one(sql):
        return db.execute(sql).fetchone()[0] or 0

    stats = {
        "sum_total": one("SELECT SUM(balance) FROM balances"),
        "sum_vaulted": one("SELECT SUM(vaulted) FROM balances"),
        "holders": one("SELECT COUNT(*) FROM balances WHERE balance > 0"),
        "delegates": one("SELECT COUNT(DISTINCT staker) FROM delegation"),
        "delegators": one("SELECT COUNT(DISTINCT owner) FROM delegation"),
        "summary_built": int(time.time()),
    }
    for k, v in stats.items():
        db.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (k, str(v)),
        )

    db.commit()
    db.execute("ANALYZE")
    db.commit()
    print(f"summary built in {time.time()-t0:.1f}s")
    for k, v in stats.items():
        print(f"  {k:<14} {v}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.exit(f"summary build failed: {e}")
