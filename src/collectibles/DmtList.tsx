import { useState } from "react";

// Latest DMTs — Divi Meta Tokens.
//
// Structure taken from the spec (Divi-Blockchain_6.9/docs/DMT-TOKENS-SPEC.md):
//   • a token's canonical id is (block height, tx index) of its issuance;
//     the ticker is a human alias and every record references the id
//   • tickers are 3-8 chars, A-Z 0-9 !#^-_+. , first char a letter, NO lowercase
//     — case-folding is forbidden precisely so DIVI and divi can never be two
//     different tokens, so search must uppercase before matching
//   • `decimals` is display only; all arithmetic is integer smallest-units
//   • supply policy comes from flags: open mint, locked, non-transferable,
//     issuer-mintable, proceeds burned, rising price

export interface DmtFilters {
  q: string;
  sort: "newest" | "holders" | "supply" | "activity";
  policy: "all" | "open" | "fixed" | "mintable" | "nontransferable";
}

/** Tickers are uppercase-only by protocol, so typing lowercase must still match. */
export const normaliseTicker = (s: string) => s.trim().toUpperCase();

export function DmtList({ compact = false }: { compact?: boolean }) {
  const [f, setF] = useState<DmtFilters>({ q: "", sort: "newest", policy: "all" });

  return (
    <section className="panel">
      <div className="list-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Latest DMTs <span className="muted nfd-sub">Divi Meta Tokens</span>
        </h2>
        <div className="list-controls">
          <form className="jump" onSubmit={(e) => e.preventDefault()}>
            <input
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              placeholder="Search ticker, name or issuer…"
              aria-label="Search tokens"
              style={{ width: 210 }}
            />
            <button type="submit">Search</button>
          </form>
          <label className="sizer">
            Policy
            <select value={f.policy} onChange={(e) => setF({ ...f, policy: e.target.value as DmtFilters["policy"] })}>
              <option value="all">All</option>
              <option value="open">Open mint</option>
              <option value="fixed">Fixed supply</option>
              <option value="mintable">Issuer mintable</option>
              <option value="nontransferable">Non-transferable</option>
            </select>
          </label>
          <label className="sizer">
            Sort
            <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as DmtFilters["sort"] })}>
              <option value="newest">Newest</option>
              <option value="holders">Most holders</option>
              <option value="supply">Largest supply</option>
              <option value="activity">Most active</option>
            </select>
          </label>
        </div>
      </div>

      {!compact && (
        <p className="wl-note">
          Tokens issued on Divi — anything from a currency to a ticket, a membership or a points
          balance. Balances are held by <strong>address</strong>, so staking never touches them.
          Each token sets its own supply rules, and those rules are fixed on-chain at issue.
        </p>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th style={{ textAlign: "right" }}>Supply</th>
              <th style={{ textAlign: "right" }}>Holders</th>
              <th>Policy</th>
              <th>Issued</th>
            </tr>
          </thead>
        </table>
      </div>

      <div className="soon-empty">
        <div className="soon-badge">COMING SOON</div>
        <p>
          No tokens have been issued yet — the protocol is specified and its indexer is built and
          tested (78 tests), but no records exist on-chain so far.
        </p>
        <p className="muted">
          Tickers will be 3–8 characters, uppercase only. That restriction is deliberate: it makes
          look-alike names using Cyrillic or invisible characters structurally impossible, so no
          token can impersonate another.
        </p>
      </div>
    </section>
  );
}
