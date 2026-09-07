import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  balances,
  nfdsOwnedBy,
  allTokens,
  formatAmount,
  shortId,
  type Nfd,
  type SyncState,
  type TokenBalance,
  type TokenMeta,
} from "../overlay";
import { Preview } from "./Preview";
import { SyncNote } from "./SyncNote";

// What an address holds in tokens and collectibles.
//
// This existed as a gap rather than a decision: the index has known the answer
// since the read API was built, the typed client had the calls, and the address
// page never asked. Somebody looking up an address could see their DIVI and not
// the tokens sitting at the same address.
//
// Renders nothing at all when an address holds neither, which is almost every
// address, so an ordinary address page is unchanged.

export function AddressHoldings({ address }: { address: string }) {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [meta, setMeta] = useState<Record<string, TokenMeta>>({});
  const [collectibles, setCollectibles] = useState<Nfd[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);

  useEffect(() => {
    let alive = true;

    // Both halves independently: an address may hold one and not the other, and
    // a failure of one should not hide the other.
    balances([address])
      .then(async (e) => {
        if (!alive) return;
        setTokens(e.data.balances);
        setSync(e.sync);
        if (e.data.balances.length === 0) return;
        // Decimals are needed to render an amount correctly, and they live on
        // the token rather than the balance.
        const all = await allTokens();
        if (!alive) return;
        const byId: Record<string, TokenMeta> = {};
        for (const t of all.data.tokens) byId[t.tokenId] = t;
        setMeta(byId);
      })
      .catch(() => {});

    nfdsOwnedBy(address)
      .then((e) => {
        if (!alive) return;
        setCollectibles(e.data.nfds);
        setSync((s) => s ?? e.sync);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [address]);

  if (tokens.length === 0 && collectibles.length === 0) return null;

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <h2 className="section-title">
        Also held here <span className="muted nfd-sub">Tokens and collectibles</span>
      </h2>

      {tokens.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Ticker</th>
                <th style={{ textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((b) => {
                const m = meta[b.tokenId];
                return (
                  <tr key={b.tokenId}>
                    <td>
                      <Link to={`/dmt/${b.tokenId}`} className="mono">
                        {b.tokenId}
                      </Link>
                    </td>
                    <td>
                      {m?.ticker ? (
                        <span className="badge badge-pos">{m.ticker}</span>
                      ) : (
                        <span className="muted">no ticker</span>
                      )}
                    </td>
                    {/* Until the metadata arrives, decimals are unknown, so the
                        raw smallest-unit amount is shown rather than a number
                        that might be wrong by a factor of a hundred million. */}
                    <td className="mono" style={{ textAlign: "right" }}>
                      {m ? formatAmount(b.amount, m.decimals) : b.amount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {collectibles.length > 0 && (
        <>
          <h3 className="nfd-subhead">
            Collectibles{collectibles.length > 1 ? ` (${collectibles.length})` : ""}
          </h3>
          <ul className="nfd-grid">
            {collectibles.map((n) => (
              <li key={n.id}>
                <Link to={`/nfd/${n.id}`} title="Open this collectible">
                  <Preview thumbPtr={n.thumbPtr} size="tile" alt={`Collectible ${shortId(n.id)}`} />
                </Link>
                <Link to={`/nfd/${n.id}`} className="mono nfd-strip-id">
                  {shortId(n.id, 6)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <SyncNote sync={sync} />
    </section>
  );
}
