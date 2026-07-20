import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { scanRichList, type RichList } from "../api";

// Rich List — ranked by OWNER, not by whoever stakes the coins.
//
// This cannot come from the node: its address index has no way to rank all
// addresses, and it ignores Divi's vault script type entirely. The figures come
// from our own chain scan, which credits vaulted coins to the owner who can
// actually spend them rather than the delegate who merely stakes them.

const PAGE = 100;

export function RichListPage() {
  const [data, setData] = useState<RichList | null>(null);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    scanRichList(PAGE, offset)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [offset]);

  if (err) return <p className="panel err">{err}</p>;
  if (!data) return <p className="panel muted">Loading the rich list…</p>;

  const total = data.total || 1;
  const built = data.builtAt ? new Date(data.builtAt * 1000).toLocaleString() : null;

  return (
    <section className="panel">
      <div className="list-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Rich List
        </h2>
        <div className="list-controls">
          <button
            className="linkbtn"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            ← Previous
          </button>
          <span className="muted">
            {(offset + 1).toLocaleString()}–{(offset + data.rows.length).toLocaleString()} of{" "}
            {data.holders.toLocaleString()}
          </span>
          <button
            className="linkbtn"
            disabled={offset + PAGE >= data.holders}
            onClick={() => setOffset(offset + PAGE)}
          >
            Next →
          </button>
        </div>
      </div>

      <p className="wl-note">
        Ranked by owner. Coins held in a vault count for the owner — the person who can actually
        spend them — never for the delegate staking on their behalf.
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Address</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th style={{ textAlign: "right" }}>Share</th>
              <th>Held as</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const pct = (r.balance / total) * 100;
              const vaultPct = r.balance ? (r.vaulted / r.balance) * 100 : 0;
              return (
                <tr key={r.address}>
                  <td className="muted">{r.rank.toLocaleString()}</td>
                  <td>
                    <Link to={`/address/${r.address}`} className="mono">
                      {r.address}
                    </Link>
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {Math.round(r.balance / 1e8).toLocaleString()}
                  </td>
                  <td className="muted" style={{ textAlign: "right" }}>
                    {pct < 0.01 ? "<0.01%" : `${pct.toFixed(2)}%`}
                  </td>
                  <td>
                    {r.vaulted === 0 ? (
                      <span className="muted">self-custodied</span>
                    ) : vaultPct >= 99.5 ? (
                      <span className="badge badge-pos">VAULTED</span>
                    ) : (
                      <span className="badge badge-pos">{Math.round(vaultPct)}% VAULTED</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {built && (
        <p className="muted tsnote">
          {/* Never imply this is live — it's a snapshot from the last scan. */}
          Snapshot taken {built}. Balances move with every block; this is rebuilt periodically
          rather than continuously.
        </p>
      )}
    </section>
  );
}
