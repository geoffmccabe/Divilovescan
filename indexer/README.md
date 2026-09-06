# The explorer's overlay indexer

**There is deliberately almost nothing here.** `src/main.rs` is two lines: it
calls the shared scanner in `vendor/dvxp-scan`. Everything it does lives in the
chain repo.

## Why it used to be more than that

This directory used to carry its own scanner, and it worked. It also had three
problems that only appear once it runs as a service rather than as a one-shot
job:

1. **It ran once and exited.** No resume, no tip following; a restart rescanned
   the whole chain from the start.
2. **It never handled a reorg.** Divi caps reorganisations at 100 blocks and they
   do happen. A replaced block silently left the wrong collectible owner in
   place, with nothing anywhere to indicate it.
3. **Its fingerprint covered collectibles but not tokens.** DMT records were
   applied and then left out of the one value whose entire job is detecting that
   two independent indexers disagree. A fingerprint that covers half the state
   reads as an assurance and is not one.

Fixing those in a copy that lived here would have meant two scanners to keep in
step forever, which is precisely the divergence the shared crate exists to
prevent. So the fixes went upstream and this became a shim.

## The vendored crates

`vendor/` is a byte-identical copy of the chain repo's `contrib/`, made by
`./sync-crates.sh`, recording the exact upstream commit in `vendor/UPSTREAM`.
They are **not forks**. Never edit them here: change the chain repo and re-run
the script, or the explorer and the wallet will quietly disagree about what a
record means, and proof-of-work cannot arbitrate between two interpretations.

Note `name-registry` in that list. `dmt-indexer` gained a dependency on it when
Divi Names and tokens started sharing ticker rules, and this script was not
re-run afterwards, so the vendored set had quietly stopped building. Re-run the
script after **any** upstream change, not only ones that look relevant.

## Running it

```
DIVI_RPC_USER=... DIVI_RPC_PASS=... \
START_HEIGHT=<overlay genesis> \
API_BIND=127.0.0.1:8710 \
  ./target/release/divi-overlay-indexer
```

`API_BIND` is the read API that `functions/api/overlay/[[route]].ts` proxies to.
Keep it on loopback and reach it through the tunnel, exactly as the node itself
is reached: nothing here should be directly exposed.

`START_HEIGHT` matters more than anything else. Overlay records below the genesis
height are ignored by the rules, so with it set the scanner never touches the
4.1M blocks that predate tokens. It is still `0` upstream, and the daemon warns
when it is left there.

Full documentation: `vendor/dvxp-scan/README.md`.
