import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  token as fetchToken,
  formatAmount,
  OverlayError,
  type HistoryEvent,
  type SyncState,
  type TokenMeta,
} from "../overlay";
import { SyncNote } from "./SyncNote";

// A single token, and everything that has happened to it.
//
// The canonical id is (block height, tx index) of issuance. Every record
// references that, never the ticker, so a ticker is a convenience the explorer
// resolves rather than an identity the protocol relies on.

export function DmtDetail() {
  const { id = "" } = useParams();
  const isId = /^\d+:\d+$/.test(id);

  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isId) return;
    let alive = true;
    fetchToken(id)
      .then((e) => {
        if (!alive) return;
        setMeta(e.data.token);
        setHistory(e.data.history);
        setSync(e.sync);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof OverlayError && e.status === 404) setStatus("missing");
        else {
          setErr(e instanceof Error ? e.message : "The index could not be reached.");
          setStatus("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [id, isId]);

  if (!isId) {
    return (
      <section className="panel">
        <h2 className="section-title">Token</h2>
        <p className="err">
          A token id looks like <span className="mono">306:2</span>: the block it was created in,
          then its position in that block.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">
          Token{" "}
          {meta?.ticker ? (
            <span className="badge badge-pos">{meta.ticker}</span>
          ) : (
            <span className="mono">{id}</span>
          )}
        </h2>

        <dl className="kv">
          <dt>Token id</dt>
          <dd className="mono">{id}</dd>

          {meta && (
            <>
              <dt>Ticker</dt>
              <dd>
                {meta.ticker || (
                  <span className="muted">
                    None. A ticker is optional and separately priced; the token works without one.
                  </span>
                )}
              </dd>

              <dt>Supply</dt>
              <dd className="mono">
                {formatAmount(meta.totalSupply, meta.decimals)}
                {meta.maxSupply && (
                  <span className="muted"> of {formatAmount(meta.maxSupply, meta.decimals)} max</span>
                )}
              </dd>

              <dt>Decimals</dt>
              <dd>
                {meta.decimals}
                {meta.decimals === 0 && (
                  <span className="muted"> — indivisible, so it is only ever whole units</span>
                )}
              </dd>

              <dt>Policy</dt>
              <dd>
                {meta.mintOpen && <span className="badge badge-pos">OPEN MINT</span>}{" "}
                {meta.supplyLocked ? (
                  <>
                    Supply permanently frozen.{" "}
                    <span className="muted">No more of this token can ever be created.</span>
                  </>
                ) : (
                  "Supply not locked."
                )}
              </dd>

              <dt>Issuer</dt>
              <dd className="mono dmt-issuer">{meta.issuer}</dd>

              {meta.genesisTxid && (
                <>
                  <dt>Created by transaction</dt>
                  <dd>
                    <Link to={`/tx/${meta.genesisTxid}`} className="hash">
                      {meta.genesisTxid}
                    </Link>
                  </dd>
                </>
              )}

              <dt>Metadata</dt>
              <dd>
                {meta.metadataPtr ? (
                  <span className="mono dmt-issuer">{meta.metadataPtr}</span>
                ) : (
                  <span className="muted">
                    None published. The chain carries a ticker, not a name or artwork.
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>

        <SyncNote sync={sync} />
      </section>

      {status === "ready" && (
        <section className="panel">
          <h2 className="section-title">
            Activity{history.length > 0 ? ` (${history.length})` : ""}
          </h2>
          {history.length === 0 ? (
            <p className="wl-note">Nothing has happened to this token since it was created.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Block</th>
                    <th>Transaction</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={`${h.txid}-${i}`}>
                      <td>{h.kind === "transfer-out" ? "transfer" : h.kind}</td>
                      <td>
                        <Link to={`/block/${h.height}`}>{h.height.toLocaleString()}</Link>
                      </td>
                      <td>
                        <Link to={`/tx/${h.txid}`} className="mono dmt-issuer">
                          {h.txid}
                        </Link>
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {formatAmount(h.amount, meta?.decimals ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {status === "missing" && (
        <section className="panel">
          <div className="soon-empty">
            <div className="soon-badge">NOT FOUND</div>
            <p>
              The index has no token with that id. Only a transaction that carried a valid issue
              record, and paid the registry fee, creates one.
            </p>
          </div>
        </section>
      )}

      {status === "error" && (
        <section className="panel">
          <div className="soon-empty">
            <div className="soon-badge">INDEX UNAVAILABLE</div>
            <p>{err}</p>
          </div>
        </section>
      )}
    </>
  );
}
