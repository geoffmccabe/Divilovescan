import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { shortId, type Nfd, type SyncState } from "../overlay";
import { Preview } from "./Preview";

// What the overlay did in one block, shown on the block page.
//
// This is the reason the index has a per-block route: a block with two hundred
// transactions must not become two hundred questions. One request, and if the
// block contains nothing this component renders nothing at all rather than an
// empty panel on every block page in the chain.
//
// A collectible's id IS its mint transaction, so every thumbnail here is
// clickable twice over: the picture goes to the collectible, and the hash goes
// to the transaction that created it.

interface BlockActivity {
  minted: Nfd[];
  transferred: Nfd[];
  collections: string[];
  tokenEvents: { kind: string; tokenId: string; amount: string; txid: string }[];
  empty: boolean;
}

/// The same panel serves a block page and a transaction page. They ask the same
/// question of the same log, only scoped differently, so one component with one
/// route shape beats two that drift apart.
export function BlockCollectibles({
  height,
  txid,
  title = "In this block",
}: {
  height?: number;
  txid?: string;
  title?: string;
}) {
  const [activity, setActivity] = useState<BlockActivity | null>(null);
  const path = txid ? `tx/${txid}` : `block/${height}`;

  useEffect(() => {
    let alive = true;
    fetch(`/api/overlay/${path}`)
      .then((r) => (r.ok ? (r.json() as Promise<BlockActivity & { sync: SyncState }>) : null))
      .then((body) => {
        if (alive && body) setActivity(body);
      })
      // Silent on failure, deliberately. The overlay is an extra layer over the
      // block; if its index is down the block page is still a complete and
      // correct block page, and an error box on every block would be noise.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  if (!activity || activity.empty) return null;

  const { minted, transferred, collections, tokenEvents } = activity;

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <h2 className="section-title">
        {title} <span className="muted nfd-sub">Collectibles and tokens</span>
      </h2>

      {minted.length > 0 && (
        <>
          <h3 className="nfd-subhead">
            Minted{minted.length > 1 ? ` (${minted.length})` : ""}
          </h3>
          <ul className="nfd-strip">
            {minted.map((n) => (
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

      {transferred.length > 0 && (
        <>
          <h3 className="nfd-subhead">
            Changed hands{transferred.length > 1 ? ` (${transferred.length})` : ""}
          </h3>
          <ul className="nfd-strip">
            {transferred.map((n) => (
              <li key={`t-${n.id}`}>
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

      {collections.length > 0 && (
        <p className="wl-note">
          {collections.length === 1 ? "A collection was" : `${collections.length} collections were`}{" "}
          created here:{" "}
          {collections.map((c, i) => (
            <span key={c}>
              {i > 0 && ", "}
              <Link to={`/collection/${c}`} className="mono">
                {shortId(c, 6)}
              </Link>
            </span>
          ))}
        </p>
      )}

      {tokenEvents.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Token event</th>
                <th>Token</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {tokenEvents.map((e, i) => (
                <tr key={`${e.txid}-${i}`}>
                  <td>{e.kind === "transfer-out" ? "transfer" : e.kind}</td>
                  <td>
                    <Link to={`/dmt/${e.tokenId}`} className="mono">
                      {e.tokenId}
                    </Link>
                  </td>
                  {/* Raw smallest-unit amount: this table has no token metadata
                      to divide by, and a wrong number is worse than an
                      unformatted one. The token page formats it properly. */}
                  <td className="mono" style={{ textAlign: "right" }}>
                    {e.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
