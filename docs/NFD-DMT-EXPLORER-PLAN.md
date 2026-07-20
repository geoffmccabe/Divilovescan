# NFD + DMT explorer — plan

**Status: awaiting approval. Nothing below is built yet.**

Adding NFD (Divi Collectibles) and DMT (Divi Meta Tokens) browsing to
scan.divi.love, built now so it is ready to wire up the moment the protocols
carry live records.

Audience: whoever works on this next, and the NFD / DMT workstreams who will
want the explorer to reflect their protocols correctly.

---

## 0. Findings that shape the plan

**Neither protocol is live on-chain yet.** Both are fully specified and both have
working reference indexers, but no DVXP records of type `0x02` or `0x04` exist on
mainnet. So every count starts at zero, and the explorer must say *"not launched
yet"* rather than showing a confident `0` that reads as "nobody is using this".

**The indexers already exist — do not re-implement them.** In
`Divi-Blockchain_6.9/contrib/`:

| crate | size | tests | provides |
|---|---|---|---|
| `dvxp-core` | 552 lines | 12 | envelope parsing, varints, `Address`/`ObjectId`, `RecordHandler` registry, state fingerprint |
| `nfd-indexer` | 265 lines | 9 | `owner_of`, `owned_by`, `enc_pubkey_of`, `get`, `count` |
| `dmt-indexer` | 3,053 lines | 78 | balances, holders, tickers, supply policy, mint state, fingerprints |

These encode the exact skip-vs-halt rules, ordering, and sender-identity logic.
Re-deriving them is how two indexers silently diverge, which
`INDEXER-ARCHITECTURE.md` explicitly warns against. **The explorer consumes these,
it does not reinvent them.**

**"Collections" is not in the NFD protocol.** The spec has MINT, TRANSFER and
KEY-ANNOUNCE — no grouping field. `DIVI-COLLECTIBLES-NFT-BRIEF.md` lists
collections under future "Polish". Options in §5.

**Naming:** the spec says **Divi Meta Tokens** (attributed to Geoff, 2026-Jul-19),
not "Divi Metal Tokens".

---

## 1. What we're modelling

### NFD — an NFT, address-owned
Record type `0x02`. Owned by an *address*, never bound to a coin (a coin-bound
asset would be consumed by staking). Full file is AES-encrypted on Arweave; only
the owner can decrypt. A creator may publish an unencrypted WebP preview ≤500px.

- **NFD id = the mint txid.**
- Owner = address funding `vin[0]` of the mint tx; TRANSFER only counts if
  `vin[0]` equals the current owner.
- `content_hash = SHA-256(salt ‖ plaintext)` — salted, so it cannot be
  brute-matched against a known file.
- **A public preview is the creator's claim, not proof.** The spec is explicit
  that a preview need not depict what is encrypted. The explorer must never imply
  the thumbnail *is* the asset.

### DMT — fungible tokens
Record type `0x04`. Subtypes: ISSUE, TRANSFER, MINT, NAME COMMIT, BURN, LOCK
SUPPLY, ISSUER TRANSFER.

- **Token id = (block height, tx index)** of issuance. Tickers are a human alias;
  every record references the id.
- Tickers: 3–8 chars, `A–Z 0–9 !#^-_+.`, first char a letter, no lowercase.
  Registered by commit-reveal, priced by length.
- `decimals` is **display only** — all arithmetic is integer smallest-units.
- Supply policies: fixed · issuer-mintable · open mint · hybrid. Flags cover
  open mint, locked supply, non-transferable, issuer-mintable, burned proceeds,
  rising price.

---

## 2. Home page

Four panels, replacing Difficulty:

```
Blocks   |   NFDs – Divi Collectibles   |   DMTs – Divi Meta Tokens   |   DIVI Coin Supply
```

`NFD` / `DMT` in bold, the rest as now.

| panel | stats |
|---|---|
| NFDs | Collections · NFDs |
| DMTs | Tokens Made · Total Tokens |

Clicking the NFD or DMT panel switches the list below from **Latest Blocks** to
**Latest NFDs** / **Latest DMTs**. Selection lives in the URL (`/?view=nfd`) so it
survives a refresh and can be linked.

Before launch each stat reads **"—"** with *"not launched yet"*, not `0`.

---

## 3. The pages

### NFDs
- **Latest NFDs** — preview, name, creator, owner, mint time, transfer count.
- **NFD detail** `/nfd/<mint_txid>` — preview, current owner, full provenance
  chain, `content_hash`, Arweave pointers, encrypted-or-not, mint transaction.
- **Owner view** `/address/<addr>` gains an NFDs section (`owned_by`).
- **Controls** — search by id/owner/creator; filter encrypted / has-preview /
  recently transferred; sort by mint time or transfer count.

### DMTs
- **Latest DMTs** — ticker, name, supply, holders, policy badge, issued time.
- **Token detail** `/dmt/<ticker-or-id>` — supply and what's mintable, decimals,
  policy flags as plain badges (Open mint · Locked · Non-transferable · Rising
  price · Proceeds burned), holder distribution, transfers, mint progress and
  price, issuer, metadata.
- **Holders** — ranked, with share; the same owner-truth rule as the rich list.
- **Address view** gains a token-balances section.
- **Controls** — search by ticker/name/id/issuer; filter by policy, mintable,
  has-metadata; sort by holders, supply, age, mint activity.

Ticker search must be **case-insensitive input, uppercase match** — the protocol
forbids lowercase precisely so `DIVI` and `divi` can never be different tokens.

---

## 4. Build order

**Phase 1 — shell (works today).** Four panels, click-to-switch, routes, empty
states, search recognising tickers and NFD ids. Ships immediately; no protocol
needed. *Small.*

**Phase 2 — record scanner.** Walk blocks, pull `OP_META` outputs, parse the DVXP
envelope, dispatch through `dvxp-core` to the NFD and DMT handlers, persist to our
SQLite index. Reuses the existing `chain-scan.py` walk. **Decision required:**
run the Rust crates as a sidecar (correct by construction, needs a Rust build on
the node) or port their logic to Python (no build, but risks divergence — the
exact failure the shared-core design exists to prevent). *Recommend the sidecar.*
*Medium.*

**Phase 3 — API + pages.** `scan_nfd_list/get/by_owner`, `scan_dmt_list/get/
holders/transfers`, through both allow-lists, then the pages above. *Medium.*

**Phase 4 — Arweave previews.** Fetch `thumb_ptr` via
`https://arweave.net/<base64url(32 bytes)>`, cache server-side. Previews are
untrusted creator-supplied images: served from our cache with a size cap, never
hot-linked, always labelled as the creator's claim. *Small.*

**Phase 5 — polish.** Provenance timelines, holder charts, mint-progress bars,
NFD/DMT activity added to the charts page.

---

## 5. Decisions — SETTLED (Geoff, 2026-Jul-20)

1. **Collections → "Creators".** The protocol has no grouping field, so NFDs are
   grouped by the creator address that minted them.
2. **Total Tokens → "Token Users":** addresses holding at least one token.
   Summing units across tokens with different `decimals` would have produced a
   meaningless number.
3. **Rust indexer sidecar** — reuse `dvxp-core` / `nfd-indexer` / `dmt-indexer`
   rather than porting their logic.
4. **Panels visible pre-launch**, marked "Coming Soon", and clickable so the
   structure can be seen before there is data.

### Original wording of the open questions

1. **Collections** — not in the protocol. Group by creator address (available
   immediately, and how most chains without native collections do it), read from
   Arweave metadata (creator-controlled, needs a fetch, optional), or drop the
   stat until the protocol defines one? *Recommend: creator address, labelled
   "Creators" if that reads more honestly.*
2. **"Total Tokens"** — total distinct tokens issued, or total units across all
   tokens? Units across tokens with different `decimals` aren't comparable, so
   "Tokens Made" and "Total Tokens" may want to be *tokens issued* and *total
   holders*, or *total transfers*.
3. **Indexer**: Rust sidecar (recommended) or Python port?
4. **Pre-launch presentation**: hide the panels until records exist, or show them
   with "not launched yet"? *Recommend showing — it signals what's coming.*

---

## 6. Risks

- **Divergence.** Two indexers disagreeing is the one failure these systems can't
  survive. Mitigation: use the shared core, and compare the per-block fingerprint
  `F(n)=SHA256(F(n-1)‖height‖Δ)` against another indexer.
- **Reorgs.** The indexers assume 200-block undo; our scanner is forward-only
  today and needs the same handling before it can track the tip live.
- **Untrusted previews.** Creator-supplied images displayed to the public: cache,
  cap, never hot-link, never present as proof of the encrypted content.
- **Spec drift.** These specs changed within hours during this planning. Re-read
  before implementing each phase.
