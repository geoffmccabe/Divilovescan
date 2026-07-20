import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  blockRange,
  getBlockCount,
  getChainInfo,
  getBlockHash,
  getBlockRaw,
  isLotteryBlock,
  isTreasuryBlock,
  isProofOfWork,
  type BlockRow,
  type ChainInfo,
} from "../api";
import { timeAgo, fmtTime } from "../format";
import nyan from "../assets/nyan_cat.webp";
import { NfdList } from "../collectibles/NfdList";
import { DmtList } from "../collectibles/DmtList";

const PAGE_SIZES = [10, 100, 1000];

type View = "blocks" | "nfd" | "dmt";

export function Home() {
  // Which list shows below the panels. Kept in the URL so it survives a refresh
  // and can be linked to, rather than being invisible component state.
  const [params, setParams] = useSearchParams();
  const view = ((params.get("view") as View) || "blocks") as View;
  const setView = (v: View) => setParams(v === "blocks" ? {} : { view: v }, { replace: true });

  const [info, setInfo] = useState<ChainInfo | null>(null);
  const [supply, setSupply] = useState<number | null>(null);
  const [tip, setTip] = useState<number | null>(null);
  const [rows, setRows] = useState<BlockRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [size, setSize] = useState(100);
  // null = follow the chain tip; a number pins the list to that height.
  const [from, setFrom] = useState<number | null>(null);
  const [jump, setJump] = useState("");

  // Chain summary. Total supply isn't in getblockchaininfo — every block header
  // carries the money supply as of that block, so the tip gives it for free.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const i = await getChainInfo();
        if (!alive) return;
        setInfo(i);
        setTip(i.blocks);
        const b = await getBlockRaw(await getBlockHash(i.blocks));
        if (alive && typeof b?.moneysupply === "number") setSupply(b.moneysupply);
      } catch {
        /* the block list reports errors; don't double up */
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const start = from ?? (await getBlockCount());
        const r = await blockRange(start, size);
        if (!alive) return;
        setRows(r);
        setErr(null);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, size]);

  const top = rows?.[0]?.height ?? null;
  const bottom = rows?.[rows.length - 1]?.height ?? null;

  const doJump = (e: React.FormEvent) => {
    e.preventDefault();
    const h = parseInt(jump.trim(), 10);
    if (!Number.isFinite(h) || h < 0) return;
    setRows(null);
    setFrom(h);
    setJump("");
  };

  return (
    <>
      <section className="stats stats-4">
        <button
          className={"panel stat stat-btn" + (view === "blocks" ? " stat-on" : "")}
          onClick={() => setView("blocks")}
        >
          <div className="stat-label">Blocks</div>
          <div className="stat-value">{info ? info.blocks.toLocaleString() : "—"}</div>
        </button>

        <button
          className={"panel stat stat-btn" + (view === "nfd" ? " stat-on" : "")}
          onClick={() => setView("nfd")}
        >
          <div className="stat-label">
            <strong>NFD</strong>s – Divi Collectibles
          </div>
          {/* Not launched, so these read as dashes with a "coming soon" marker.
              A confident 0 would say nobody is using it, which is a different
              and untrue claim. */}
          <div className="stat-pair">
            <span>
              <em>—</em> Creators
            </span>
            <span>
              <em>—</em> NFDs
            </span>
          </div>
          <div className="soon-tag">Coming Soon</div>
        </button>

        <button
          className={"panel stat stat-btn" + (view === "dmt" ? " stat-on" : "")}
          onClick={() => setView("dmt")}
        >
          <div className="stat-label">
            <strong>DMT</strong>s – Divi Meta Tokens
          </div>
          <div className="stat-pair">
            <span>
              <em>—</em> Tokens Made
            </span>
            <span>
              <em>—</em> Token Users
            </span>
          </div>
          <div className="soon-tag">Coming Soon</div>
        </button>

        <div className="panel stat">
          <div className="stat-label">DIVI Coin Supply</div>
          <div className="stat-value">
            {supply != null ? Math.round(supply).toLocaleString() : "—"}
          </div>
        </div>
      </section>

      {view === "nfd" && <NfdList />}
      {view === "dmt" && <DmtList />}

      {view === "blocks" && (
      <section className="panel">
        <div className="list-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            {from == null ? "Latest Blocks" : `Blocks from ${from.toLocaleString()}`}
          </h2>
          <div className="list-controls">
            <form onSubmit={doJump} className="jump">
              <input
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                placeholder="Jump to block…"
                inputMode="numeric"
                aria-label="Jump to block height"
              />
              <button type="submit">Go</button>
            </form>
            <label className="sizer">
              Show
              <select
                value={size}
                onChange={(e) => {
                  setRows(null);
                  setSize(Number(e.target.value));
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {from != null && (
              <button className="linkbtn" onClick={() => { setRows(null); setFrom(null); }}>
                Back to tip
              </button>
            )}
          </div>
        </div>

        {err && !rows && <p className="err">{err}</p>}
        {!err && !rows && <p className="muted">Loading blocks…</p>}

        {rows && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Height</th>
                    <th>Age</th>
                    <th>Time</th>
                    <th>Txs</th>
                    <th>Size</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b, i) => {
                    // Rows run newest-first, so the NEXT row is this block's
                    // parent. Divi only requires a block to be later than the
                    // median of the previous 11 blocks, not later than its own
                    // parent, so timestamps legitimately run backwards
                    // sometimes. Flag it rather than hide or "correct" it.
                    const parent = rows[i + 1];
                    const backwards = parent != null && b.time < parent.time;
                    const lottery = isLotteryBlock(b.height);
                    return (
                    <tr key={b.hash} className={lottery ? "row-lottery" : undefined}>
                      <td>
                        <Link to={`/block/${b.height}`} className="mono">
                          {b.height.toLocaleString()}
                        </Link>
                      </td>
                      <td className="muted">{timeAgo(b.time)}</td>
                      <td className="muted nowrap">
                        {fmtTime(b.time)}
                        {backwards && (
                          <span
                            className="tsflag"
                            title={
                              `This block's timestamp is ${parent.time - b.time}s earlier than the ` +
                              `block before it. That is valid on Divi: a block only has to be later ` +
                              `than the median of the previous 11 blocks, not later than its parent.`
                            }
                          >
                            ↩
                          </span>
                        )}
                      </td>
                      <td>{b.txCount}</td>
                      <td className="muted">{b.size != null ? `${b.size.toLocaleString()} B` : "—"}</td>
                      <td>
                        {/* Every block past 100 is a stake, so that isn't worth
                            showing. The weekly superblocks are. */}
                        {isProofOfWork(b.height) ? (
                          <span className="badge badge-pow">POW</span>
                        ) : lottery ? (
                          <span className="lot-cell">
                            <span className="badge badge-lottery">LOTTERY!</span>
                            <img className="lot-nyan" src={nyan} alt="" aria-hidden />
                          </span>
                        ) : isTreasuryBlock(b.height) ? (
                          <span className="badge badge-treasury">TREASURY</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted tsnote">
              <span className="tsflag">↩</span> marks a block whose timestamp is earlier than the
              block before it. This is normal on Divi — consensus only requires a block to be later
              than the median of the previous 11 blocks, not later than its immediate parent.
            </p>

            <div className="pager">
              <button
                className="linkbtn"
                disabled={tip != null && top != null && top >= tip}
                onClick={() => { setRows(null); setFrom((top ?? 0) + size); }}
              >
                ← Newer
              </button>
              <span className="muted">
                {top != null && bottom != null &&
                  `${bottom.toLocaleString()} – ${top.toLocaleString()}`}
              </span>
              <button
                className="linkbtn"
                disabled={bottom != null && bottom <= 0}
                onClick={() => { setRows(null); setFrom((bottom ?? 0) - 1); }}
              >
                Older →
              </button>
            </div>
          </>
        )}
      </section>
      )}
    </>
  );
}
