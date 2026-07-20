# Divi Love Scan — integration guide for other agents

**What this is:** a public block explorer for the Divi blockchain at
**https://scan.divi.love**, plus the chain-analysis index behind it. If your
project needs Divi chain data — balances, transactions, staking, rich list,
network topology — read this before building your own reader. Several things
about Divi are *not* what a Bitcoin-shaped assumption would predict, and getting
them wrong produces confidently wrong numbers.

Repo: `geoffmccabe/Divilovescan` (public — no credentials, ever).

---

## 1. Divi facts that will bite you

These are verified against Divi Core source and against live chain data, not
inferred. Each one has broken something during this build.

### 1.1 Vault outputs are invisible to the node's address index

Divi has its own script type, `vault`, which lets an owner delegate *staking*
without delegating *spending*. The node's `addressindex` **does not index them
at all**.

Measured on live data:

| | share of staking payouts | share of staked value |
|---|---|---|
| `vault` | ~51% | ~76% |
| `pubkeyhash` | ~49% | ~24% |

Across the whole supply, **28.6% sits in vaults**. So `getaddressbalance` returns
**zero** for a large fraction of real holders. An explorer or wallet built on the
node index alone will tell those users they own nothing.

A vault names two parties, and `getrawtransaction` decodes both:

```json
"scriptPubKey": {
  "type": "vault",
  "addresses": ["<owner>", "<staker>"]
}
```

`addresses[0]` is the **owner** (free-spend branch of the script);
`addresses[1]` is the **delegated staker**, who may stake those coins but can
never spend or take them.

**Attribute value to the owner.** Crediting the staker would make a handful of
staking services look like they hold — and win — most of the chain.

### 1.2 Fees are BURNED, not paid to the staker

From `BlockConnectionService.cpp`:

```cpp
//PoW phase redistributed fees to miner. PoS stage destroys fees.
if (isProofOfWork)
    nExpectedMint.nStakeReward += nFees;
```

Proof-of-work ended at block 100, so **every fee since then is destroyed**.
Confirmed on a live block: staker received exactly the 498 DIVI reward while
money supply grew by 497.99994946 — the missing 0.00005054 was the fee, and it
went nowhere.

Consequence: `supply growth = reward − fees`. Divi is quietly deflationary on
every transaction. Don't model fees as staker income.

### 1.3 Every block after 100 is Proof-of-Stake

`nLastPOWBlock = 100`. So "is this a stake block?" is true for all ~4.13M blocks
and is not worth displaying. What *is* meaningful:

- **Lottery block:** `height >= 101 && height % 10080 == 0`
- **Treasury block:** `height >= 101 && height % 10081 == 0`

The off-by-one is deliberate. 10080 and 10081 are coprime, so the two payouts
only collide at block **101,616,480** — which is exactly the height where Divi
switches to a different rule (`SuperblockHeightValidator`, `transitionHeight_ =
cycle * treasuryCycle`). We are ~193 years from that, so the legacy formula above
is correct today.

### 1.4 Identifying a coinstake, and its real reward

A coinstake is **transaction index 1** in the block, marked by its **first output
having value 0**.

Its total output is NOT the reward — it includes the staker's own coins being
returned. Measured example: staked input 10,000, total output 10,498,
**actual reward 498**. Reporting the gross figure overstates by 21×.

```
reward = sum(coinstake outputs) − sum(coinstake inputs)
```

### 1.5 Coin maturity

From `chainparams.cpp` and `wallet.cpp`: a coin can stake once it is **≥ 1 hour
old** *and* has ≥ 10 confirmations (20 if it came from a coinstake). At ~60s
blocks the confirmation floor is always reached first, so **the one-hour age is
the binding constraint**.

### 1.6 Transaction format

Classic pre-SegWit Bitcoin: `version | vin | vout | nLockTime`. Verified in
`primitives/transaction.h`:

- **No witness section** — signatures live inline in `scriptSig`.
- **No per-transaction timestamp** — the Peercoin-style `nTime` field is
  commented out. Do not expect it.

### 1.7 Block timestamps run backwards

Consensus requires a block to be later than the **median of the previous 11
blocks**, not later than its parent (`ChainExtensionService.cpp`). Measured 3
inversions in 12 consecutive blocks. **Order by height, never by time.** Sorting
by timestamp will silently reorder the chain.

### 1.8 The network cannot be enumerated

Divi has no `getnodeaddresses` or address-manager RPC. The only nodes you can
learn about are ones your node actually connects to. Any "full network" view has
to be accumulated over time; it can never be complete.

### 1.9 The node is easy to knock over

Divi defaults to **4 RPC threads**. A few slow calls occupy all of them and the
node stops answering entirely while still happily accepting blocks — it looks
dead but isn't. This has caused three outages here.

- `getchaintips` walks the whole fork set and **stalls RPC for ~18 seconds**.
  Never call it from a request path. We refresh it hourly into a file.
- Keep background scanners well under the thread count. Our node now runs
  `rpcthreads=32`; scanners use ≤ 6–16 workers.

---

## 2. Architecture

```
Divi Core 3.0.0.0 (IONOS VPS)
  addressindex=1 spentindex=1 txindex=1
        │  localhost only, never exposed
        ▼
divi-rpc-proxy.py        ← the real security boundary
  strict method allow-list, shared-secret header, response scrubbing
        │
        ▼
Cloudflare Tunnel  (node.divi.love — no inbound ports)
        │
        ▼
Pages Function /api/rpc  ← allow-list again + edge caching
        │
        ▼
React app  (scan.divi.love)
```

**Why two allow-lists:** anything reaching the tunnel hostname bypasses the
Worker entirely, so the Worker's list is a convenience and the proxy's list is
the boundary. Add a method to one and not the other and it silently fails.

**Scrubbing matters.** `getinfo` returns the node's **own wallet balance**
alongside node facts; it is filtered to a field whitelist (a whitelist, so a
future Divi release adding a wallet field can't start publishing it). `getpeerinfo`
is trimmed too — `addrlocal` is used internally to derive our own address but is
never published per-peer.

---

## 3. Public API

`POST https://scan.divi.love/api/rpc`, body `{"method": "...", "params": [...]}`,
response `{"result": ...}` or `{"error": "..."}`. No key required. Read-only.
Edge-cached (immutable data effectively forever; tip data seconds).

### Pass-through chain calls
`getblockchaininfo` · `getblockcount` · `getblockhash` · `getblock` ·
`getrawtransaction` · `getaddressbalance` · `getaddresstxids` ·
`getaddressutxos` · `getaddressdeltas` · `getspentinfo` ·
`getlotteryblockwinners` · `getchaintips` · `getpeerinfo` · `getinfo`

⚠ Remember §1.1: the `getaddress*` calls **omit vault holdings**. For a true
balance use `scan_address` below.

### Explorer-specific

| method | params | returns |
|---|---|---|
| `scan_blockrange` | `[startHeight, count]` (≤1000) | compact block rows, newest first — batched server-side |
| `scan_summary` | — | chain-wide totals (see below) |
| `scan_richlist` | `[limit≤200, offset]` | owner-ranked balances incl. vaulted share |
| `scan_address` | `[address]` | **true** balance + delegation both ways |
| `scan_series` | — | ~2,900 daily rows for charts |
| `scan_peers` | — | current peers + our own address |
| `scan_known` | — | nodes seen in the last 30 days, located |
| `scan_geo` | `[[ip,…]]` | geolocation, cached permanently |
| `scan_probe` | `[[ip,…]]` | TCP liveness on port 51472 |

`scan_address` shape:

```json
{
  "balance": 4049687924000000,      // satoshi, INCLUDING vaulted
  "vaulted": 4049687924000000,
  "utxos": 12,
  "stakedBy":  [{"address": "<delegate>", "amount": 4049687924000000}],
  "stakesFor": [{"address": "<owner>",    "amount": 4049687924000000}],
  "stakesForTotal": 4049687924000000,
  "builtAt": 1784500787
}
```

`scan_summary` currently reports: height 4,131,278 · 9,193,559 transactions ·
931,063 real payments · 990,974 addresses ever · 28,614 holding a balance ·
969,530 that have ever sent · 28.6% of supply vaulted · 4,028 delegators ·
3,962 delegates.

**All `scan_*` data is a snapshot**, rebuilt periodically, not live. Every
response carries `builtAt`. Do not present it as current to the second.

---

## 4. The index

SQLite at `/var/lib/divi-scan/divi-index.sqlite` on the node. Built by three
passes, all resumable:

| script | cost | produces |
|---|---|---|
| `chain-scan.py` | ~3h | UTXO set keyed by owner **and staker**, address first-seen heights |
| `chart-scan.py` | ~45min | daily blocks/txs/payments/supply/difficulty (headers only — no per-tx fetch) |
| `stake-scan.py` | ~1.5h | who won each block, per day |
| `build-summary.py` | ~15s | materialises `balances`, `delegation`, wallet growth, totals |

Grouping 390k UTXOs live takes ~3s, which is fine once and hopeless per request —
hence the materialised tables (3.1s → 0.019s).

**Validation to copy:** every block header carries `moneysupply`, so an
independently computed UTXO total must match the chain's own figure. Ours agrees
to **49 satoshi out of 471 trillion**. If you build a balance index, check it
this way; a plausible-looking rich list that is quietly wrong is worse than none.

**Handle amounts as exact decimals.** Scaling a JSON float by 1e8 loses satoshis
— we hit this and switched to `Decimal`.

---

## 5. Presentation rules worth inheriting

- **Part-days lie.** Today is incomplete and the chain's launch day carried one
  block (which made "block time" read 86,400s). Both ends are trimmed, plus
  leading ramp-up days below 60% of the median block count.
- **Zero is sometimes real.** Trim leading zeroes only where zero is impossible
  (supply, difficulty). For counts, zero *is* a measurement.
- **Never fabricate a missing value.** State the absence and why.
- Skins are shared with the Divi Desktop wallet: same token keys, same CSS
  variables (`theme/tokens.ts`). A skin exported there imports here unchanged.

---

## 6. Roadmap

**Done:** blocks, transactions, addresses, search, rich list, chain health with
fork tree, stats, 9 charts, network map with geolocation and liveness probing,
byte-by-byte transaction inspector, burned-fee accounting, shared skin system.

**In progress / next:**
- Stake-winner scan completing (chart is partial until then)
- **Fees burned** totals and a daily chart — needs one more pass; no scan
  records per-block fees yet
- Labelling known exchange / DiviGo addresses on the rich list
- Chain Health branch rows: link hashes to block pages, add date/time
- Incremental top-up so the index tracks the tip instead of full re-scans
- `divi.love` main site with wallet downloads

**Known limits:** the 30-day network fills in slowly (§1.8); `scan_*` data is a
snapshot; one node means one vantage point, and its peer count is not a census.

---

## 7. If you're integrating

- **Reading Divi data?** Use `scan_address` rather than `getaddressbalance`, or
  you will report zero for vault holders.
- **Showing staking rewards?** Subtract the coinstake's inputs (§1.4).
- **Linking to a transaction?** `https://scan.divi.love/tx/<txid>`; blocks are
  `/block/<height-or-hash>`, addresses `/address/<address>`.
- **Running your own scanner?** Keep well under the node's RPC thread count and
  never call `getchaintips` on a request path.
- **Need something not exposed?** Both allow-lists must be updated together, and
  anything wallet-adjacent must be scrubbed before it is published.
