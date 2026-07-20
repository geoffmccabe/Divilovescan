import { useState } from "react";

// Latest NFDs — Divi Collectibles.
//
// The protocol carries no records yet, so this deliberately shows its full
// structure with an empty state rather than hiding until launch: the columns
// and controls ARE the specification made visible, and they're what the indexer
// will be wired into.
//
// Modelled on the spec (Divi-Blockchain_6.9/docs/NFD-COLLECTIBLES-SPEC.md):
//   • an NFD's id IS its mint txid
//   • ownership is by ADDRESS, never bound to a coin (staking would eat it)
//   • the full file is encrypted on Arweave; a public preview is optional and
//     is the creator's CLAIM, not proof of what was encrypted

export interface NfdFilters {
  q: string;
  sort: "newest" | "oldest" | "transfers";
  only: "all" | "preview" | "encrypted";
}

export function NfdList({ compact = false }: { compact?: boolean }) {
  const [f, setF] = useState<NfdFilters>({ q: "", sort: "newest", only: "all" });

  return (
    <section className="panel">
      <div className="list-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Latest NFDs <span className="muted nfd-sub">Divi Collectibles</span>
        </h2>
        <div className="list-controls">
          <form className="jump" onSubmit={(e) => e.preventDefault()}>
            <input
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              placeholder="Search id, owner or creator…"
              aria-label="Search collectibles"
              style={{ width: 210 }}
            />
            <button type="submit">Search</button>
          </form>
          <label className="sizer">
            Show
            <select value={f.only} onChange={(e) => setF({ ...f, only: e.target.value as NfdFilters["only"] })}>
              <option value="all">All</option>
              <option value="preview">With preview</option>
              <option value="encrypted">Encrypted</option>
            </select>
          </label>
          <label className="sizer">
            Sort
            <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as NfdFilters["sort"] })}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="transfers">Most transferred</option>
            </select>
          </label>
        </div>
      </div>

      {!compact && (
        <p className="wl-note">
          Collectibles on Divi. Each is owned by an <strong>address</strong>, never tied to a coin —
          so staking or spending your DIVI never affects what you own. The artwork itself is
          encrypted and only the owner can open it; a creator may publish a small preview alongside.
        </p>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Preview</th>
              <th>Collectible</th>
              <th>Creator</th>
              <th>Owner</th>
              <th>Minted</th>
              <th style={{ textAlign: "right" }}>Transfers</th>
            </tr>
          </thead>
        </table>
      </div>

      <div className="soon-empty">
        <div className="soon-badge">COMING SOON</div>
        <p>
          No collectibles have been minted yet — the protocol is specified and its indexer is built
          and tested, but no records exist on-chain so far.
        </p>
        <p className="muted">
          When the first one is minted it appears here automatically. Nothing above is a mock-up:
          those are the columns and controls that will be populated.
        </p>
      </div>
    </section>
  );
}
