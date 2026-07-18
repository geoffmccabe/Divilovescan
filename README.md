# Divilovescan

Scanner and Explorer for the Divi Blockchain — served at **scan.divi.love**, styled to
match the Divi Desktop 6.9 wallet.

Divi's own explorers (diviscan.io, blocks.divi.domains) no longer resolve, leaving
chainz.cryptoid.info as the only working option — a third party nobody in the Divi
community controls. This replaces it.

## Why this is built rather than forked

Divi Core already contains everything an explorer needs. With address indexing enabled
the daemon answers address balances, transaction history, UTXOs and spend lookups
directly, so there is **no separate index database** — no MongoDB, no RocksDB, no
multi-day sync. That is what makes a purpose-built explorer cheaper to run than forking
an existing one.

It also means the frontend can reuse the wallet's own design language instead of being
a restyled stranger.

## Proof-of-Stake is handled correctly

Divi is a staking chain, so most blocks are won rather than mined. A coinstake
transaction returns the staker's own coins alongside the reward, so its **total output
is not the reward**. Measured on a real block:

| | |
|---|---|
| Staked input | 10,000 DIVI |
| Total output | 10,498 DIVI |
| **Actual reward** | **498 DIVI** |

A generic explorer reports 10,498 — a 21x overstatement. This one subtracts the inputs.

## Architecture

```
Divi node (address indexing on)
  -> Cloudflare Tunnel        (node has no public IP, no inbound ports)
  -> Pages Function /api/rpc  (strict method allow-list, edge cached)
  -> React app on Cloudflare Pages
```

The Pages Function is the only bridge to the node and permits a fixed list of read-only
chain queries. Anything else — wallet calls, key access, node control — is rejected
outright. Credentials live in Cloudflare secrets and never in this repo.

Confirmed blocks and transactions are immutable, so they cache at the edge indefinitely.
The node sees very little traffic regardless of how busy the explorer gets.

## Local development

Requires an SSH tunnel to a Divi node on port 51500.

```
DIVI_RPC_URL=http://127.0.0.1:51500/ \
DIVI_RPC_USER=<user> DIVI_RPC_PASS=<pass> \
  node scripts/dev-api.mjs &

npm run dev
```

`scripts/dev-api.mjs` stands in for the Pages Function locally and enforces the same
allow-list, so dev and production cannot drift.

## Deployment

Cloudflare Pages, build command `npm run build`, output directory `dist`.

Required secrets:

| Secret | Meaning |
|---|---|
| `SCAN_ORIGIN` | Tunnel hostname of the read-only proxy on the node |
| `SCAN_SHARED_SECRET` | Proves a request came from this Worker |

The node's RPC credentials are deliberately **not** among them — they stay in
`/etc/divi-scan.env` on the node itself. Compromising the Cloudflare side
therefore cannot yield wallet access; the worst case is read-only chain data
that is public anyway.

## Status

Blocks, transactions and search work against a live node today. **Address pages require
address indexing to be enabled on the node** (a one-time reindex); until then they
explain that rather than showing a misleading empty result.
