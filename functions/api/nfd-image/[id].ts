// Cloudflare Pages Function: every collectible preview the explorer shows.
//
// Nothing on the site links a browser straight at a storage gateway, and that
// is the whole point of this file existing.
//
// ## Why not just use the gateway URL in an <img> tag
//
// Four reasons, in order of how much they matter:
//
// 1. **Moderation needs a choke point.** `docs/NFD-MODERATION.md` calls for a
//    published blocklist of banned collectible ids and thumbnail pointers that
//    the explorer subscribes to. A blocklist is only enforceable if every image
//    passes through somewhere we control. Hotlinking from a hundred pages means
//    there is no such place, and adding one later means changing every page.
//    That list does not exist yet. This is the seam it plugs into, and the check
//    is already wired so it is a data change and not a code change.
//
// 2. **Content-type confusion is a real attack.** A thumbnail pointer is just
//    an id: nothing on-chain forces what it points at to be an image. A creator
//    can point it at HTML. Served from our own origin with the gateway's own
//    content type, that is stored cross-site scripting on the explorer. So the
//    type is taken from a fixed allow-list here, never from upstream, and the
//    response is sandboxed and marked no-sniff.
//
// 3. **Hotlinking leaks every visitor.** An <img> straight to a gateway tells
//    that gateway the IP of everyone who so much as scrolls past a collectible.
//
// 4. **Caching.** Arweave ids are content-derived, so bytes at an id can never
//    change. That caches at the edge effectively forever, which is what makes a
//    grid of previews cheap.
//
// ## What a preview is, and is not
//
// The preview is the creator's CLAIM about what they encrypted. It is not proof
// of it: `thumb_ptr` is an independent object and nothing on-chain binds it to
// `content_hash` (spec §2). The UI must say so. This function serves the bytes;
// it does not endorse them.

interface Env {
  /** Arweave gateway. Defaults to the public one if unset. */
  ARWEAVE_GATEWAY?: string;
  /** Comma-separated ids to refuse, until the signed blocklist exists. */
  NFD_BLOCKLIST?: string;
}

/// Types we are willing to serve. Anything else is refused rather than
/// forwarded, because the alternative is serving attacker-chosen bytes with an
/// attacker-chosen type from our own origin.
const SERVEABLE: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
  "image/avif": "image/avif",
};

/// A preview is specified as a small image, roughly 100KB. This is a generous
/// ceiling on that, not a target: it exists so one pathological object cannot
/// be used to run up bandwidth or wedge a Worker.
const MAX_BYTES = 4 * 1024 * 1024;

/// Arweave ids are 32 bytes in base64url: 43 characters, no padding.
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = String(ctx.params.id ?? "");

  if (!ID_PATTERN.test(id)) {
    return refuse("Not a storage id.", 400);
  }

  // The blocklist seam. Today this is an environment variable and usually
  // empty; when the signed blocklist from the moderation plan exists, only the
  // source of this set changes.
  const blocked = new Set(
    (ctx.env.NFD_BLOCKLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (blocked.has(id)) {
    // Deliberately explicit rather than a broken image. Someone looking at a
    // removed preview should know it was removed, not think the site is broken.
    return refuse("This preview has been removed.", 451);
  }

  const key = new Request(`https://nfd-image.cache/${id}`, { method: "GET" });
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) return hit;

  const gateway = (ctx.env.ARWEAVE_GATEWAY ?? "https://arweave.net").replace(/\/$/, "");

  let upstream: Response;
  try {
    upstream = await fetch(`${gateway}/${id}`, {
      // A gateway that is slow is a gateway we do not wait for. The grid shows
      // a placeholder instead, which is a better page than a hanging one.
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return refuse("The storage gateway is not responding.", 504);
  }

  if (!upstream.ok) {
    return refuse("No preview stored at that id.", 404);
  }

  // Upstream's type is an input, not an instruction.
  const declared = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const serveAs = SERVEABLE[declared];
  if (!serveAs) {
    return refuse("That id does not hold a supported image.", 415);
  }

  const length = Number(upstream.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) {
    return refuse("That preview is too large to serve.", 413);
  }

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    // Checked again after reading: content-length is a claim, not a guarantee.
    return refuse("That preview is too large to serve.", 413);
  }

  const res = new Response(bytes, {
    status: 200,
    headers: {
      "content-type": serveAs,
      // Content-derived ids cannot change what they point at, so this is safe
      // to hold for a year.
      "cache-control": "public, max-age=31536000, immutable",
      // Belt and braces against the content-type confusion described above.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-site",
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
};

/// Refusals are JSON rather than an image, so a caller can tell WHY a preview is
/// missing. The UI turns that into a caption; a broken image icon would say
/// nothing.
function refuse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
