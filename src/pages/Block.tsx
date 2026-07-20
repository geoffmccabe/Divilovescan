import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { getBlockHash, getBlockRaw, summariseBlock, isLotteryBlock, type BlockSummary } from "../api";
import { fmtDivi, fmtTime, shortHash } from "../format";

export function BlockPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [summary, setSummary] = useState<BlockSummary | null>(null);
  const [txids, setTxids] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSummary(null);
    setErr(null);
    (async () => {
      try {
        const hash = /^\d+$/.test(id) ? await getBlockHash(Number(id)) : id;
        const raw = await getBlockRaw(hash);
        if (!alive) return;
        setTxids(raw.tx ?? []);
        setSummary(await summariseBlock(hash));
      } catch {
        if (!alive) return;
        // 64 hex characters could equally be a transaction id — the search box
        // can't tell them apart, so try that before declaring failure.
        if (/^[0-9a-f]{64}$/i.test(id)) {
          nav(`/tx/${id}`, { replace: true });
          return;
        }
        setErr("No block found with that height or hash.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, nav]);

  if (err) return <p className="panel err">{err}</p>;
  if (!summary) return <p className="panel muted">Loading block…</p>;

  // A lottery block pays eleven winners out of the same coinstake that pays the
  // staker, so it needs labelling that separates the two.
  const lottery = isLotteryBlock(summary.height);

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">
          Block {summary.height.toLocaleString()}{" "}
          {lottery ? (
            <span className="badge badge-lottery">LOTTERY BLOCK</span>
          ) : (
            summary.isPoS && <span className="badge badge-pos">PROOF OF STAKE</span>
          )}
        </h2>
        <dl className="kv">
          <dt>Hash</dt>
          <dd className="hash">{summary.hash}</dd>
          <dt>Time</dt>
          <dd>{fmtTime(summary.time)}</dd>
          <dt>Transactions</dt>
          <dd>{summary.txCount}</dd>
          {summary.isPoS && (
            <>
              <dt className={lottery ? "lot-gold" : undefined}>
                {lottery ? "Lottery rewards" : "Stake reward"}
              </dt>
              <dd className={"mono " + (lottery ? "lot-gold" : "ok")}>
                {summary.stakeReward != null ? `+${fmtDivi(summary.stakeReward)} DIVI` : "—"}
              </dd>
              {/* "Won by" read as though this address won the lottery. It didn't:
                  it staked the coins that produced the block. The winners are
                  separate outputs of the same transaction. */}
              <dt>Staked by</dt>
              <dd>
                {summary.stakeWinner ? (
                  <Link to={`/address/${summary.stakeWinner}`} className="hash">
                    {summary.stakeWinner}
                  </Link>
                ) : (
                  "—"
                )}
                <div className="muted stake-by-note">
                  {lottery
                    ? "This address found the block. The lottery winners are paid separately, in the transaction below."
                    : "This address found the block by staking."}
                </div>
              </dd>
            </>
          )}
          <dt>Navigate</dt>
          <dd>
            <Link to={`/block/${summary.height - 1}`}>← Previous</Link>{" "}
            <Link to={`/block/${summary.height + 1}`} style={{ marginLeft: 12 }}>
              Next →
            </Link>
          </dd>
        </dl>
      </section>

      <section className="panel">
        <h2 className="section-title">Transactions ({txids.length})</h2>
        <p className="drill-hint">
          <strong>Click a transaction</strong> to open it, where the Transaction Inspector explains
          every byte of it.
        </p>
        <div className="table-scroll">
          <table>
            <tbody>
              {txids.map((t, i) => (
                <tr key={t}>
                  <td style={{ width: 84 }} className="muted">
                    {i === 1 && lottery ? (
                      <span className="badge badge-lottery">LOTTERY!</span>
                    ) : i === 1 && summary.isPoS ? (
                      <span className="badge badge-pos">STAKE</span>
                    ) : (
                      `#${i}`
                    )}
                  </td>
                  <td>
                    <Link to={`/tx/${t}`} className="mono">
                      {shortHash(t, 20, 12)}
                    </Link>
                    {i === 1 && lottery && (
                      <Link to={`/tx/${t}`} className="lot-seewinners">
                        {" "}← See the winners here!
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
