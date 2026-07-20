# Overlay indexer sidecar

Walks the Divi chain, pulls `OP_META` data outputs, and feeds them through the
**existing** NFD and DMT indexers. Writes the resulting state to a JSON snapshot
that `divi-rpc-proxy.py` serves.

## Why a sidecar rather than re-implementing

The record rules already exist as tested Rust in
`Divi-Blockchain_6.9/contrib/` — `dvxp-core` (12 tests), `nfd-indexer` (9) and
`dmt-indexer` (78). They encode the skip-vs-halt decision, canonical varints,
deterministic ordering, and the `vin[0]` sender rule.

Two indexers that silently disagree is the one failure these overlays cannot
survive, which is exactly why `INDEXER-ARCHITECTURE.md` insists on one shared
core. So this crate contains **no protocol logic at all**: it is I/O, a loop,
and a snapshot writer. Every decision about what a record means belongs to the
upstream handlers.

## The crates are vendored, not forked

`sync-crates.sh` copies them from the chain repo into `vendor/` and records the
upstream commit in `vendor/UPSTREAM`. They are gitignored, so this repo never
carries a second copy that could drift silently.

**Re-run the sync after any upstream change.** Those specs moved several times in
a single day while this was being planned.

## Output

`/var/lib/divi-scan/overlay.json`:

```json
{
  "height": 4132800,
  "fingerprint": "…",
  "builtAt": 1784500787,
  "nfd": { "count": 0, "items": [], "creators": 0 },
  "dmt": { "count": 0, "tokens": [], "users": 0 }
}
```

The fingerprint is `dvxp-core`'s chained per-block hash. Another indexer over the
same chain must produce the same value; if it doesn't, one of them is wrong and
that is worth knowing loudly.
