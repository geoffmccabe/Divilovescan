import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getTx, type RawTx } from "../api";
import { fmtDivi, fmtTime } from "../format";

export function TxPage() {
  const { txid = "" } = useParams();
  const [tx, setTx] = useState<RawTx | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTx(null);
    setErr(null);
    getTx(txid)
      .then((t) => alive && setTx(t))
      .catch(() =>
        alive &&
        setErr(
          "No transaction found with that id. Note that a node only serves arbitrary transactions when transaction indexing is enabled.",
        ),
      );
    return () => {
      alive = false;
    };
  }, [txid]);

  if (err) return <p className="panel err">{err}</p>;
  if (!tx) return <p className="panel muted">Loading transaction…</p>;

  const isCoinbase = tx.vin.some((v) => v.coinbase !== undefined);
  // A coinstake is marked by its first output being empty.
  const isCoinstake = tx.vout.length > 0 && tx.vout[0].value === 0;
  const totalOut = tx.vout.reduce((s, o) => s + (o.value || 0), 0);

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">
          Transaction {isCoinstake && <span className="badge badge-pos">STAKE</span>}
        </h2>
        <dl className="kv">
          <dt>Transaction id</dt>
          <dd className="hash">{tx.txid}</dd>
          {tx.blocktime && (
            <>
              <dt>Time</dt>
              <dd>{fmtTime(tx.blocktime)}</dd>
            </>
          )}
          <dt>Confirmations</dt>
          <dd className={tx.confirmations ? "ok" : "muted"}>
            {tx.confirmations ?? 0}
            {!tx.confirmations && " — unconfirmed"}
          </dd>
          <dt>Total output</dt>
          <dd className="mono">{fmtDivi(totalOut)} DIVI</dd>
        </dl>
        {isCoinstake && (
          <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 0 }}>
            This is a staking transaction. The total above includes the staker's own coins being
            returned to them — only the amount above the staked input is newly created.
          </p>
        )}
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Inputs ({tx.vin.length})</h2>
        {isCoinbase ? (
          <p className="muted">Newly generated coins (no inputs).</p>
        ) : (
          <div className="table-scroll">
            <table>
              <tbody>
                {tx.vin.map((v, i) => (
                  <tr key={i}>
                    <td>
                      {v.txid ? (
                        <Link to={`/tx/${v.txid}`} className="mono">
                          {v.txid.slice(0, 20)}…:{v.vout}
                        </Link>
                      ) : (
                        <span className="muted">generated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Outputs ({tx.vout.length})</h2>
        <div className="table-scroll">
          <table>
            <tbody>
              {tx.vout.map((o) => {
                const addr = o.scriptPubKey?.addresses?.[0];
                return (
                  <tr key={o.n}>
                    <td>
                      {addr ? (
                        <Link to={`/address/${addr}`} className="mono">
                          {addr}
                        </Link>
                      ) : (
                        <span className="muted">{o.scriptPubKey?.type ?? "nonstandard"}</span>
                      )}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {fmtDivi(o.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
