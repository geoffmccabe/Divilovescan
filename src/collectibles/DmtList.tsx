import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { allTokens, formatAmount, type SyncState, type TokenMeta } from "../overlay";
import { SyncNote } from "./SyncNote";

// Latest DMTs — Divi Meta Tokens.
//
// From the spec:
//   • a token's canonical id is (block height, tx index) of its issuance; the
//     ticker is a human alias and every record references the id
//   • tickers are uppercase-only, deliberately: case-folding is forbidden so
//     that DIVI and divi can never become two different tokens, which means
//     search must uppercase before matching
//   • `decimals` is display only; all arithmetic is integer smallest-units, and
//     amounts arrive as strings because a large supply with 8 decimals exceeds
//     what a JavaScript number holds exactly

/** Tickers are uppercase-only by protocol, so typing lowercase must still match. */
export const normaliseTicker = (s: string) => s.trim().toUpperCase();

function policyOf(t: TokenMeta): string {
  if (t.mintOpen) return "Open mint";
  if (t.supplyLocked) return "Supply locked";
  return "Fixed";
}

export function DmtList({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [tokens, setTokens] = useState<TokenMeta[] | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;
    allTokens()
      .then((e) => {
        if (!alive) return;
        setTokens(e.data.tokens);
        setSync(e.sync);
      })
      .catch(() => alive && setUnavailable(true));
    return () => {
      alive = false;
    };
  }, []);

  const needle = normaliseTicker(q);
  const shown = (tokens ?? []).filter(
    (t) =>
      !needle ||
      t.ticker.includes(needle) ||
      t.tokenId.includes(needle) ||
      t.issuer.toUpperCase().includes(needle),
  );

  return (
    <section className="panel">
      <div className="list-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Latest DMTs <span className="muted nfd-sub">Divi Meta Tokens</span>
        </h2>
        <div className="list-controls">
          <form className="jump" onSubmit={(e) => e.preventDefault()}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ticker, token id or issuer…"
              aria-label="Search tokens"
              style={{ width: 220 }}
            />
          </form>
        </div>
      </div>

      {!compact && (
        <p className="wl-note">
          Tokens issued on the Divi blockchain. Balances are recorded and ordered by the chain
          itself. A token always has a numeric id; a ticker is an optional human-readable alias on
          top of it.
        </p>
      )}

      {unavailable && (
        <div className="soon-empty">
          <div className="soon-badge">INDEX UNAVAILABLE</div>
          <p>
            The token index is not answering right now. Block and transaction pages are unaffected.
          </p>
        </div>
      )}

      {!unavailable && tokens !== null && shown.length === 0 && (
        <div className="soon-empty">
          <div className="soon-badge">{needle ? "NO MATCHES" : "NONE YET"}</div>
          <p>
            {needle
              ? "Nothing matched that. Search takes a ticker, a token id, or an issuer."
              : "No tokens have been issued yet. When the first one is, it appears here automatically."}
          </p>
        </div>
      )}

      {!unavailable && shown.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Ticker</th>
                <th>Policy</th>
                <th>Issuer</th>
                <th style={{ textAlign: "right" }}>Supply</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.tokenId}>
                  <td>
                    <Link to={`/dmt/${t.tokenId}`} className="mono">
                      {t.tokenId}
                    </Link>
                  </td>
                  <td>
                    {t.ticker ? (
                      <span className="badge badge-pos">{t.ticker}</span>
                    ) : (
                      <span className="muted">no ticker</span>
                    )}
                  </td>
                  <td>{policyOf(t)}</td>
                  <td className="mono dmt-issuer">{t.issuer}</td>
                  {/* decimals is a DISPLAY concern only; the stored amount is
                      always an integer in the smallest unit. */}
                  <td className="mono" style={{ textAlign: "right" }}>
                    {formatAmount(t.totalSupply, t.decimals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SyncNote sync={sync} />
    </section>
  );
}
