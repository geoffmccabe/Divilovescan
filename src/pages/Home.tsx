import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChainInfo, getRecentBlocks, type BlockSummary, type ChainInfo } from "../api";
import { fmtDivi, shortHash, timeAgo } from "../format";

export function Home() {
  const [info, setInfo] = useState<ChainInfo | null>(null);
  const [blocks, setBlocks] = useState<BlockSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [i, b] = await Promise.all([getChainInfo(), getRecentBlocks(12)]);
        if (!alive) return;
        setInfo(i);
        setBlocks(b);
        setErr(null);
      } catch (e) {
        // Keep whatever is already on screen; only report if we have nothing.
        if (alive && !blocks) setErr((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <section className="stats">
        <div className="panel stat">
          <div className="stat-label">Block Height</div>
          <div className="stat-value">{info ? info.blocks.toLocaleString() : "—"}</div>
        </div>
        <div className="panel stat">
          <div className="stat-label">Difficulty</div>
          <div className="stat-value">
            {info ? info.difficulty.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>
        <div className="panel stat">
          <div className="stat-label">Coin Supply</div>
          <div className="stat-value">{info?.moneysupply ? fmtDivi(info.moneysupply) : "—"}</div>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Latest Blocks</h2>
        {err && !blocks && <p className="err">{err}</p>}
        {!err && !blocks && <p className="muted">Loading blocks…</p>}
        {blocks && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Height</th>
                  <th>Age</th>
                  <th>Txs</th>
                  <th>Type</th>
                  <th>Stake Reward</th>
                  <th>Won By</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.hash}>
                    <td>
                      <Link to={`/block/${b.height}`} className="mono">
                        {b.height.toLocaleString()}
                      </Link>
                    </td>
                    <td className="muted">{timeAgo(b.time)}</td>
                    <td>{b.txCount}</td>
                    <td>{b.isPoS ? <span className="badge badge-pos">STAKE</span> : <span className="muted">—</span>}</td>
                    <td className="mono">{b.stakeReward != null ? fmtDivi(b.stakeReward) : "—"}</td>
                    <td>
                      {b.stakeWinner ? (
                        <Link to={`/address/${b.stakeWinner}`} className="mono">
                          {shortHash(b.stakeWinner, 8, 6)}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
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
