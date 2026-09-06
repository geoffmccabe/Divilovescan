import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { shortId, type Nfd, type SyncState } from "../overlay";
import { Preview, PreviewCaveat } from "./Preview";
import { SyncNote } from "./SyncNote";

// Latest collectibles.
//
// Search is deliberately narrow: an id prefix, an owner, or a collection id.
// The chain carries no name to search for, and matching against off-chain
// metadata the index has not fetched would return results it cannot stand
// behind. Better a search that says what it does than one that quietly does
// less than it implies.

export function NfdList({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [items, setItems] = useState<Nfd[] | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;
    const limit = compact ? 12 : 60;
    const url = submitted
      ? `/api/overlay/nfds?q=${encodeURIComponent(submitted)}&limit=${limit}`
      : `/api/overlay/nfds?limit=${limit}`;

    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<{ nfds: Nfd[]; sync: SyncState }>) : null))
      .then((body) => {
        if (!alive) return;
        if (!body) {
          setUnavailable(true);
          return;
        }
        setItems(body.nfds);
        setSync(body.sync);
      })
      .catch(() => alive && setUnavailable(true));
    return () => {
      alive = false;
    };
  }, [submitted, compact]);

  return (
    <section className="panel">
      <div className="list-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Latest NFDs <span className="muted nfd-sub">Divi Collectibles</span>
        </h2>
        <div className="list-controls">
          <form
            className="jump"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(q.trim());
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Collectible id, owner or collection…"
              aria-label="Search collectibles"
              style={{ width: 240 }}
            />
            <button type="submit">Search</button>
          </form>
        </div>
      </div>

      {!compact && (
        <p className="wl-note">
          Collectibles on Divi. Each is owned by an <strong>address</strong>, never tied to a coin,
          so staking or spending your DIVI never affects what you own. The artwork itself is
          encrypted and only the owner can open it; a creator may publish a preview alongside.
        </p>
      )}

      {unavailable && (
        <div className="soon-empty">
          <div className="soon-badge">INDEX UNAVAILABLE</div>
          <p>
            The collectibles index is not answering right now. The chain itself is unaffected, and
            block and transaction pages work normally.
          </p>
        </div>
      )}

      {!unavailable && items !== null && items.length === 0 && (
        <div className="soon-empty">
          <div className="soon-badge">{submitted ? "NO MATCHES" : "NONE YET"}</div>
          <p>
            {submitted
              ? "Nothing matched that. Search takes a collectible id, an owner, or a collection id."
              : "No collectibles have been minted yet. When the first one is, it appears here automatically."}
          </p>
        </div>
      )}

      {!unavailable && items !== null && items.length > 0 && (
        <>
          <ul className="nfd-grid">
            {items.map((n) => (
              <li key={n.id}>
                <Link to={`/nfd/${n.id}`} title="Open this collectible">
                  <Preview thumbPtr={n.thumbPtr} size="tile" alt={`Collectible ${shortId(n.id)}`} />
                </Link>
                <Link to={`/nfd/${n.id}`} className="mono nfd-strip-id">
                  {shortId(n.id, 6)}
                </Link>
                {n.collectionId && (
                  <Link
                    to={`/collection/${n.collectionId}`}
                    className="muted nfd-strip-id"
                    title="Part of a collection"
                  >
                    in a collection
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {!compact && <PreviewCaveat />}
        </>
      )}

      <SyncNote sync={sync} />
    </section>
  );
}
