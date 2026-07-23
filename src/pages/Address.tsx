import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAddressBalance, getAddressTxids, scanAddress, type ScanAddress } from "../api";
import { labelFor, labelTag } from "../labels";
import { fmtDivi, shortHash } from "../format";

export function AddressPage() {
  const { address = "" } = useParams();
  const [balance, setBalance] = useState<{ balance: number; received: number } | null>(null);
  const [txids, setTxids] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Our own index — the only source that sees vault holdings.
  const [scan, setScan] = useState<ScanAddress | null>(null);

  useEffect(() => {
    let alive = true;
    setBalance(null);
    setTxids(null);
    setScan(null);
    setErr(null);
    scanAddress(address).then((s) => alive && setScan(s)).catch(() => {});
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
  // Our index is the authoritative view here — it's the only one that sees vaults.
  const hasScan = !!scan && (scan.balance > 0 || scan.stakesForTotal > 0);

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Address</h2>
        <p className="hash" style={{ marginTop: 0 }}>
          {address}
          {(() => {
            const l = labelFor(address);
            return l ? <span className="addr-label" title={l.source}>{labelTag(l)}</span> : null;
          })()}
        </p>
        {balance && !hasScan && (
          <dl className="kv">
            <dt>Balance</dt>
            <dd className="mono">{fmtDivi(balance.balance / 1e8)} DIVI</dd>
            <dt>Total received</dt>
            <dd className="mono">{fmtDivi(balance.received / 1e8)} DIVI</dd>
          </dl>
        )}
        {hasScan && scan && (
          <div className="addr-scan">
            <dl className="kv">
              <dt>Balance</dt>
              <dd className="mono">
                {fmtDivi(scan.balance / 1e8)} DIVI
                {scan.vaulted > 0 && (
                  <span className="muted"> — includes vaulted coins the node's own index omits</span>
                )}
              </dd>
              {balance && balance.received > 0 && (
                <>
                  <dt>Total received</dt>
                  <dd className="mono">{fmtDivi(balance.received / 1e8)} DIVI</dd>
                </>
              )}
              {scan.vaulted > 0 && (
                <>
                  <dt>Held in a vault</dt>
                  <dd className="mono">
                    {fmtDivi(scan.vaulted / 1e8)} DIVI
                    <span className="muted"> — staked by a delegate on this owner's behalf</span>
                  </dd>
                </>
              )}
              {scan.balance > scan.vaulted && (
                <>
                  <dt>Self-custodied</dt>
                  <dd className="mono">{fmtDivi((scan.balance - scan.vaulted) / 1e8)} DIVI</dd>
                </>
              )}
            </dl>

            {scan.stakedBy.length > 0 && (
              <div className="addr-deleg">
                <div className="ts-hash-label">Staked on this owner's behalf by</div>
                <p className="muted addr-deleg-note">
                  These delegates may stake these coins but can never spend or take them — only
                  this owner can.
                </p>
                {scan.stakedBy.map((d) => (
                  <div key={d.address} className="addr-deleg-row">
                    <Link to={`/address/${d.address}`} className="mono">
                      {shortHash(d.address, 12, 8)}
                    </Link>
                    <span className="mono">{fmtDivi(d.amount / 1e8)} DIVI</span>
                  </div>
                ))}
              </div>
            )}

            {scan.stakesForTotal > 0 && (
              <div className="addr-deleg">
                <div className="ts-hash-label">
                  Stakes for others — {fmtDivi(scan.stakesForTotal / 1e8)} DIVI across{" "}
                  {scan.stakesFor.length}
                  {scan.stakesFor.length === 50 ? "+" : ""} owner
                  {scan.stakesFor.length === 1 ? "" : "s"}
                </div>
                <p className="muted addr-deleg-note">
                  This address is a staking delegate. These coins are not its own — it can stake
                  them, but never spend them.
                </p>
                {scan.stakesFor.slice(0, 10).map((d) => (
                  <div key={d.address} className="addr-deleg-row">
                    <Link to={`/address/${d.address}`} className="mono">
                      {shortHash(d.address, 12, 8)}
                    </Link>
                    <span className="mono">{fmtDivi(d.amount / 1e8)} DIVI</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {indexLikelyOff && !scan?.balance && (
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
