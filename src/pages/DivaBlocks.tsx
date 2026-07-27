import { useEffect, useState } from "react";
import { divaInfo, divaBlockRange, type DivaBlockRow, type DivaInfo } from "../api";
import { timeAgo, fmtTime } from "../format";

const COUNT = 25;

// The DIVA (EVM side-chain) block list. Shown on the home page when the DIVI/DIVA
// toggle is set to DIVA. Reuses the DIVI block-list styling for a consistent look.
export function DivaBlocks() {
  const [info, setInfo] = useState<DivaInfo | null>(null);
  const [rows, setRows] = useState<DivaBlockRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const i = await divaInfo();
        if (!alive) return;
        setInfo(i);
        const r = await divaBlockRange(i.height, COUNT);
        if (!alive) return;
        setRows(r);
        setErr(null);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <section className="stats stats-4">
        <div className="panel stat">
          <div className="stat-label">DIVA Blocks</div>
          <div className="stat-value">{info ? info.height.toLocaleString() : "—"}</div>
        </div>
        <div className="panel stat">
          <div className="stat-label">Chain ID</div>
          <div className="stat-value">{info ? info.chainId : "—"}</div>
        </div>
        <div className="panel stat">
          <div className="stat-label">Consensus</div>
          <div className="stat-value">POAS</div>
        </div>
        <div className="panel stat">
          <div className="stat-label">Status</div>
          <div className="stat-value">Devnet</div>
        </div>
      </section>

      <section className="panel">
        <div className="list-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            Latest DIVA Blocks
          </h2>
        </div>

        {err && !rows && <p className="err">{err}</p>}
        {!err && !rows && <p className="muted">Loading DIVA blocks…</p>}
        {rows && rows.length === 0 && <p className="muted">No blocks yet.</p>}

        {rows && rows.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Height</th>
                  <th>Age</th>
                  <th>Time</th>
                  <th>Txs</th>
                  <th>Gas Used</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.hash}>
                    <td>{b.height.toLocaleString()}</td>
                    <td>{timeAgo(b.time)}</td>
                    <td>{fmtTime(b.time)}</td>
                    <td>{b.txCount}</td>
                    <td>{b.gasUsed.toLocaleString()}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {b.hash.slice(0, 10)}…{b.hash.slice(-8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
