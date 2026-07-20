import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getTx, getTxHex, getBlockRaw, isLotteryBlock, lotteryPayouts, type RawTx } from "../api";
import { fmtDivi, fmtTime } from "../format";
import { TxInspector } from "../TxInspector";

export function TxPage() {
  const { txid = "" } = useParams();
  const [tx, setTx] = useState<RawTx | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  // Kept and shown rather than swallowed: a silent failure here made the whole
  // inspector vanish with no clue why.
  const [rawErr, setRawErr] = useState<string | null>(null);
  // Sum of the inputs, resolved by looking up each previous output. Needed
  // because a transaction never states its own fee — it is only implied by what
  // went in versus what came out.
  const [inputTotal, setInputTotal] = useState<number | null>(null);
  // A coinstake alone can't say whether it's a lottery block — that's a property
  // of the HEIGHT, so the containing block has to be looked up.
  const [height, setHeight] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTx(null);
    setRaw(null);
    setRawErr(null);
    setInputTotal(null);
    setHeight(null);
    setErr(null);
    getTx(txid)
      .then(async (t) => {
        if (!alive) return;
        setTx(t);

        // Resolve input values so the fee can be shown. Divi DESTROYS fees
        // rather than paying them to the staker, so without this the difference
        // between inputs and outputs just disappears from the page unexplained.
        if (t.blockhash) {
          getBlockRaw(t.blockhash)
            .then((b) => alive && typeof b?.height === "number" && setHeight(b.height))
            .catch(() => {
              /* lottery labelling simply won't apply */
            });
        }

        const ins = t.vin.filter((v) => v.txid !== undefined);
        if (!ins.length) return; // generated coins: nothing was spent
        const vals = await Promise.all(
          ins.map(async (v) => {
            try {
              const prev = await getTx(v.txid!);
              return prev.vout[v.vout ?? 0]?.value ?? 0;
            } catch {
              return null; // one failure must not fake a fee
            }
          }),
        );
        // If ANY input couldn't be resolved the total would be understated and
        // the "fee" would be wrong, so report nothing rather than a wrong number.
        if (alive && vals.every((v) => v !== null)) {
          setInputTotal((vals as number[]).reduce((a, b) => a + b, 0));
        }
      })
      .catch(
        () =>
          alive &&
          setErr(
            "No transaction found with that id. Note that a node only serves arbitrary transactions when transaction indexing is enabled.",
          ),
      );

    // Fetched separately so a failure here still leaves the readable view intact.
    getTxHex(txid)
      .then((h) => alive && setRaw(typeof h === "string" ? h : String(h ?? "")))
      .catch((e) => alive && setRawErr((e as Error).message || "Could not load the raw transaction."));
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
  // Only an ordinary spend has a fee. A coinbase or coinstake CREATES coins, so
  // inputs minus outputs is negative there and means nothing.
  const fee =
    inputTotal != null && !isCoinbase && !isCoinstake
      ? Math.max(0, inputTotal - totalOut)
      : null;

  const lottery = isCoinstake && height != null && isLotteryBlock(height);
  const payouts = lottery ? lotteryPayouts(tx.vout, inputTotal) : null;

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
        <h2 className="section-title">
          {lottery ? (
            <>
              Lottery payouts{" "}
              <span className="badge badge-lottery">
                {payouts?.winnerCount ?? 0} WINNERS
              </span>
            </>
          ) : (
            `Outputs (${tx.vout.length})`
          )}
        </h2>
        {lottery && (
          <p className="wl-note">
            The big winner takes ten times a small win. The staker who found the block is paid from
            this same transaction, and is marked below so it isn't mistaken for a prize.
          </p>
        )}
        <div className="table-scroll">
          <table>
            <tbody>
              {tx.vout.map((o) => {
                const addr = o.scriptPubKey?.addresses?.[0];
                // The zero-value first output is only the marker that makes this
                // a coinstake. It carries nothing and explains nothing, so on a
                // lottery block — where every other line is money — it is pure
                // noise between the reader and the winners.
                if (lottery && !(o.value > 0)) return null;
                const isBig = payouts?.bigIndex === o.n;
                const isSmall = payouts?.smallIndexes.includes(o.n) ?? false;
                const isStaker = payouts?.stakerIndex === o.n;
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
                      {isBig && <span className="lot-big"> — BIG WINNER!!!</span>}
                      {isSmall && <span className="lot-small"> — Small Winner!</span>}
                      {isStaker && (
                        <span className="muted lot-staker">
                          {" "}
                          — not a lottery prize: the staker's own coins returned, plus the block
                          reward
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {fmtDivi(o.value)}
                    </td>
                  </tr>
                );
              })}
              {fee != null && fee > 0 && (
                <tr className="tx-fee-row">
                  <td>
                    <span className="tx-fee-label">GAS FEE BURNED</span>
                  </td>
                  <td className="mono tx-fee-amount" style={{ textAlign: "right" }}>
                    {fmtDivi(fee)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Always rendered, so a failure is visible instead of the panel silently
          disappearing. */}
      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="section-title">Transaction Inspector</h2>

        {raw ? (
          <TxInspector rawHex={raw} />
        ) : rawErr ? (
          <p className="err">Couldn't load the raw transaction: {rawErr}</p>
        ) : (
          <p className="muted">Loading the raw transaction…</p>
        )}

        {/* The unmodified transaction, exactly as it exists on the chain —
            deliberately with no highlighting or interpretation at all. */}
        <details className="collapse">
          <summary>Raw transaction</summary>
          <pre className="rawhex">{raw ?? rawErr ?? "Loading…"}</pre>
        </details>
      </section>
    </>
  );
}
