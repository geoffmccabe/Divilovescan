import { Link, useParams } from "react-router-dom";
import { normaliseTicker } from "./DmtList";

// A single token. Reached by ticker (the human alias) or by canonical id.
//
// The canonical id is (block height, tx index) of issuance — every record
// references that, never the ticker — so a ticker lookup is a convenience the
// explorer resolves, not an identity the protocol relies on.

const TICKER_RE = /^[A-Z][A-Z0-9!#^\-_+.]{2,7}$/;

export function DmtDetail() {
  const { id = "" } = useParams();
  // Tickers are uppercase-only by protocol, so typing lowercase still resolves.
  const ticker = normaliseTicker(id);
  const isTicker = TICKER_RE.test(ticker);
  const isId = /^\d+[-:]\d+$/.test(id);

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">
          Token {isTicker && <span className="badge badge-pos">{ticker}</span>}
        </h2>
        {isTicker || isId ? (
          <dl className="kv">
            <dt>{isTicker ? "Ticker" : "Token id"}</dt>
            <dd className="mono">{isTicker ? ticker : id}</dd>
            {isTicker && (
              <>
                <dt>Canonical id</dt>
                <dd className="muted">
                  Assigned at issuance as (block height, transaction index). The ticker is a
                  human-facing alias; records always reference the id.
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="err">
            That isn&apos;t a valid ticker or token id. Tickers are 3–8 characters, start with a
            letter, and use only A–Z, 0–9 and ! # ^ - _ + .
          </p>
        )}
      </section>

      <section className="panel">
        <div className="soon-empty">
          <div className="soon-badge">COMING SOON</div>
          <p>
            Supply, holders, transfers and mint progress appear here once the overlay indexer is
            running. Each token&apos;s rules — fixed supply, open mint, issuer-mintable, whether it
            can be transferred at all — are fixed on-chain when it is issued.
          </p>
          <p className="muted">
            Amounts will always be shown in the token&apos;s own units. A token&apos;s{" "}
            <code>decimals</code> setting is presentation only: every balance and transfer is an
            integer underneath, which is why two tokens with different decimals can never be
            meaningfully added together.
          </p>
          <Link to="/?view=dmt" className="linkbtn">
            ← All tokens
          </Link>
        </div>
      </section>
    </>
  );
}
