import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection as fetchCollection,
  shortId,
  OverlayError,
  type Collection,
  type Nfd,
  type SyncState,
} from "../overlay";
import { Preview, PreviewCaveat } from "./Preview";
import { SyncNote } from "./SyncNote";

// A collection and everything minted into it.
//
// The cap is the interesting number here and it is worth being precise about,
// because it is the one promise a collection makes that a buyer relies on. Only
// the creator may mint into a collection, and the chain refuses a mint past the
// cap, so "12 of 100" is enforced rather than asserted. Uncapped collections
// say so plainly instead of showing a reassuring-looking fraction.

export function CollectionDetail() {
  const { id = "" } = useParams();
  const looksLikeId = /^[0-9a-fA-F]{64}$/.test(id);
  const lower = id.toLowerCase();

  const [meta, setMeta] = useState<Collection | null>(null);
  const [members, setMembers] = useState<Nfd[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!looksLikeId) return;
    let alive = true;
    fetchCollection(lower)
      .then((e) => {
        if (!alive) return;
        setMeta(e.data.collection);
        setMembers(e.data.members);
        setSync(e.sync);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof OverlayError && e.status === 404) setStatus("missing");
        else {
          setErr(e instanceof Error ? e.message : "The index could not be reached.");
          setStatus("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [lower, looksLikeId]);

  if (!looksLikeId) {
    return (
      <section className="panel">
        <h2 className="section-title">Collection</h2>
        <p className="err">That doesn&apos;t look like a collection id.</p>
      </section>
    );
  }

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Collection</h2>

        <dl className="kv">
          <dt>Collection id</dt>
          <dd className="hash">{lower}</dd>

          <dt>Created by transaction</dt>
          <dd>
            {/* A collection's id is the transaction that created it, exactly as
                a collectible's id is its mint. */}
            <Link to={`/tx/${lower}`} className="hash">
              {lower}
            </Link>
          </dd>

          {meta && (
            <>
              <dt>Creator</dt>
              <dd className="hash">{meta.creator}</dd>

              <dt>Minted</dt>
              <dd>
                {meta.maxSupply === 0 ? (
                  <>
                    {meta.minted.toLocaleString()}{" "}
                    <span className="muted">of an unlimited supply</span>
                  </>
                ) : (
                  <>
                    {meta.minted.toLocaleString()} of {meta.maxSupply.toLocaleString()}
                    {meta.minted >= meta.maxSupply && (
                      <span className="muted"> — minted out</span>
                    )}
                  </>
                )}
              </dd>

              <dt>Metadata</dt>
              <dd className="hash">{meta.metaPtr}</dd>
            </>
          )}
        </dl>

        <SyncNote sync={sync} />
      </section>

      {status === "ready" && (
        <section className="panel">
          <h2 className="section-title">
            Collectibles{members.length > 0 ? ` (${members.length})` : ""}
          </h2>

          {members.length === 0 ? (
            <p className="wl-note">
              Nothing has been minted into this collection yet. Only its creator can mint into it.
            </p>
          ) : (
            <>
              <ul className="nfd-grid">
                {members.map((n) => (
                  <li key={n.id}>
                    <Link to={`/nfd/${n.id}`} title="Open this collectible">
                      <Preview
                        thumbPtr={n.thumbPtr}
                        size="tile"
                        alt={`Collectible ${shortId(n.id)}`}
                      />
                    </Link>
                    <Link to={`/nfd/${n.id}`} className="mono nfd-strip-id">
                      {shortId(n.id, 6)}
                    </Link>
                  </li>
                ))}
              </ul>
              <PreviewCaveat />
            </>
          )}
        </section>
      )}

      {status === "missing" && (
        <section className="panel">
          <div className="soon-empty">
            <div className="soon-badge">NOT FOUND</div>
            <p>
              The overlay index has no collection with that id. Only a transaction that carried a
              valid collection record creates one.
            </p>
          </div>
        </section>
      )}

      {status === "error" && (
        <section className="panel">
          <div className="soon-empty">
            <div className="soon-badge">INDEX UNAVAILABLE</div>
            <p>{err}</p>
          </div>
        </section>
      )}
    </>
  );
}
