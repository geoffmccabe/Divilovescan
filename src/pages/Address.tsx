import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAddressBalance, getAddressTxids } from "../api";
import { fmtDivi, shortHash } from "../format";

export function AddressPage() {
  const { address = "" } = useParams();
  const [balance, setBalance] = useState<{ balance: number; received: number } | null>(null);
  const [txids, setTxids] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBalance(null);
    setTxids(null);
    setErr(null);
    (async () => {
      try {
        const [b, t] = await Promise.all([getAddressBalance(address), getAddressTxids(address)]);
        if (!alive) return;
        setBalance(b);
        // Newest first.
        setTxids([...t].reverse());
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [address]);

  // The node reports a disabled address index with this exact phrasing, which
  // is indistinguishable from a genuinely unused address. Say so honestly
  // rather than claiming the address has no history.
  const indexLikelyOff = err?.includes("No information available");

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Address</h2>
        <p className="hash" style={{ marginTop: 0 }}>
          {address}
        </p>
        {balance && (
          <dl className="kv">
            <dt>Balance</dt>
            <dd className="mono">{fmtDivi(balance.balance / 1e8)} DIVI</dd>
            <dt>Total received</dt>
            <dd className="mono">{fmtDivi(balance.received / 1e8)} DIVI</dd>
          </dl>
        )}
        {indexLikelyOff && (
          <p className="muted" style={{ marginBottom: 0 }}>
            No history available for this address. This means either the address has never been
            used, or the explorer's node is not currently running with address indexing enabled —
            these are reported identically by the node, so we can't tell them apart.
          </p>
        )}
        {err && !indexLikelyOff && <p className="err">{err}</p>}
        {!err && !balance && <p className="muted">Loading address…</p>}
      </section>

      {txids && txids.length > 0 && (
        <section className="panel">
          <h2 className="section-title">Transactions ({txids.length})</h2>
          <div className="table-scroll">
            <table>
              <tbody>
                {txids.slice(0, 100).map((t) => (
                  <tr key={t}>
                    <td>
                      <Link to={`/tx/${t}`} className="mono">
                        {shortHash(t, 24, 12)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {txids.length > 100 && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Showing the 100 most recent of {txids.length.toLocaleString()} transactions.
            </p>
          )}
        </section>
      )}
    </>
  );
}
