import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { nfd as fetchNfd, shortId, type Nfd, type SyncState, OverlayError } from "../overlay";
import { Preview, PreviewCaveat } from "./Preview";
import { SyncNote } from "./SyncNote";

// A single collectible. Its id IS the transaction that minted it, so this page
// always has something real to show — the mint transaction — even when the
// overlay index has nothing, is behind, or is stopped.
//
// That property is worth designing around rather than working around: the chain
// facts and the index's interpretation are shown as two separate things, so a
// reader can always tell which is which.

export function NfdDetail() {
  const { id = "" } = useParams();
  const looksLikeId = /^[0-9a-fA-F]{64}$/.test(id);
  const lower = id.toLowerCase();

  const [item, setItem] = useState<Nfd | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!looksLikeId) return;
    let alive = true;
    fetchNfd(lower)
      .then((e) => {
        if (!alive) return;
        setItem(e.data.nfd);
        setSync(e.sync);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        // "Not indexed" and "index unreachable" are different facts and lead to
        // different pages, so they are not collapsed into one error.
        if (e instanceof OverlayError && e.status === 404) setNotFound(true);
        else setErr(e instanceof Error ? e.message : "The index could not be reached.");
      });
    return () => {
      alive = false;
    };
  }, [lower, looksLikeId]);

  if (!looksLikeId) {
    return (
      <section className="panel">
        <h2 className="section-title">Collectible</h2>
        <p className="err">That doesn&apos;t look like a collectible id.</p>
      </section>
    );
  }

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Collectible</h2>

        <div className="nfd-detail-head">
          <Preview thumbPtr={item?.thumbPtr ?? null} size="full" alt={`Preview of ${shortId(id)}`} />

          <dl className="kv nfd-detail-facts">
            <dt>Collectible id</dt>
            <dd className="hash">{lower}</dd>

            <dt>Mint transaction</dt>
            <dd>
              {/* Not merely related: a collectible's id is DEFINED as its mint
                  txid, so this is the same object viewed as a transaction. */}
              <Link to={`/tx/${lower}`} className="hash">
                {lower}
              </Link>
            </dd>

            {item && (
              <>
                <dt>Owner</dt>
                <dd className="hash">{item.owner}</dd>

                <dt>Minted at</dt>
                <dd>
                  <Link to={`/block/${item.mintHeight}`}>
                    block {item.mintHeight.toLocaleString()}
                  </Link>
                </dd>

                <dt>Collection</dt>
                <dd>
                  {item.collectionId ? (
                    <Link to={`/collection/${item.collectionId}`} className="hash">
                      {shortId(item.collectionId, 10)}
                    </Link>
                  ) : (
                    <span className="muted">Not part of a collection</span>
                  )}
                </dd>

                <dt>Content fingerprint</dt>
                <dd
                  className="hash"
                  title="A hash of the encrypted content. The owner's client checks it on unlock, which is what makes the artwork itself verifiable even though the preview is not."
                >
                  {item.contentHash}
                </dd>

                <dt>Stored at</dt>
                <dd className="hash">{item.arweavePtr}</dd>
              </>
            )}
          </dl>
        </div>

        <SyncNote sync={sync} />
      </section>

      {item && item.thumbPtr && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <PreviewCaveat />
        </section>
      )}

      {notFound && (
        <section className="panel">
          <div className="soon-empty">
            <div className="soon-badge">NOT FOUND</div>
            <p>
              The overlay index has no collectible with that id. The transaction may still exist:
              only a transaction that actually carried a valid mint record makes a collectible.
            </p>
            <p className="muted">
              If it was minted very recently, the index may not have reached that block yet.
            </p>
          </div>
        </section>
      )}

      {err && (
        <section className="panel">
          <div className="soon-empty">
            <div className="soon-badge">INDEX UNAVAILABLE</div>
            <p>{err}</p>
            <p className="muted">
              The mint transaction above comes from the chain itself and is unaffected. Only
              ownership and provenance need the index.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
