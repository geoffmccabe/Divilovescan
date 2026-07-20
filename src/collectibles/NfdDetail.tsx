import { Link, useParams } from "react-router-dom";

// A single collectible. Its id IS the transaction that minted it, so the page
// always has something real to show — the mint transaction — even before the
// overlay indexer is running.

export function NfdDetail() {
  const { id = "" } = useParams();
  const looksLikeId = /^[0-9a-fA-F]{64}$/.test(id);

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Collectible</h2>
        {looksLikeId ? (
          <dl className="kv">
            <dt>Collectible id</dt>
            <dd className="hash">{id}</dd>
            <dt>Mint transaction</dt>
            <dd>
              {/* Not merely related: an NFD's id is defined AS its mint txid, so
                  this link is the same object viewed as a transaction. */}
              <Link to={`/tx/${id.toLowerCase()}`} className="hash">
                {id.toLowerCase()}
              </Link>
            </dd>
          </dl>
        ) : (
          <p className="err">That doesn&apos;t look like a collectible id.</p>
        )}
      </section>

      <section className="panel">
        <div className="soon-empty">
          <div className="soon-badge">COMING SOON</div>
          <p>
            Ownership, provenance and the artwork preview appear here once the overlay indexer is
            running. An NFD is owned by an <strong>address</strong>, so its history is a chain of
            transfers rather than a coin that can be spent by accident.
          </p>
          <p className="muted">
            Note on previews: the artwork is encrypted and only the owner can open it. A creator may
            publish a preview image alongside, but that preview is the creator&apos;s claim about
            what they encrypted — it is never proof of it, and this page will say so rather than
            implying the picture is the asset.
          </p>
        </div>
      </section>
    </>
  );
}
