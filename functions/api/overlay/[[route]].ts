// Cloudflare Pages Function: the bridge to the overlay indexer.
//
// Sibling of `api/rpc.ts`, and deliberately the same posture. That file is the
// only bridge to the node; this is the only bridge to the index that runs beside
// it. Neither is reachable from the public internet directly.
//
// Why a separate function rather than more methods on `api/rpc.ts`: that one
// speaks JSON-RPC POST to a node, this one speaks REST GET to an index. Folding
// them together would mean one allow-list guarding two very different things,
// and an allow-list that guards two things eventually guards neither properly.
//
// The overlay index answers questions the node cannot: what an address holds in
// tokens, who owns a collectible, what a collection contains. The node has the
// records; only the index has the meaning.

interface Env {
  /** Tunnel hostname of the overlay indexer's read API. */
  OVERLAY_ORIGIN: string;
  /** Proves to that proxy that a request came from this Worker. */
  SCAN_SHARED_SECRET: string;
}

// Every route the indexer serves is read-only, but the allow-list is here
// anyway: a future indexer release that grew a write route must not become
// publicly reachable just because it shipped.
const ALLOWED = new Set([
  "sync",
  "stats",
  "tokens",
  "token",
  "balances",
  "history",
  "ticker",
  "mint-terms",
  "nfd",
  "nfds",
  "collection",
]);

/// Sync state changes every block and must never look fresher than it is; a
/// stale "trustworthy: true" at the edge would be worse than no answer.
function cacheSeconds(head: string): number {
  if (head === "sync") return 5;
  // Front-page counters: fresh enough to feel live, cached enough that a busy
  // front page does not become a load test on the index.
  if (head === "stats") return 15;
  // A collectible's ownership and a token's supply both move, but not fast,
  // and every answer carries the height it was true at.
  if (head === "nfd" || head === "collection" || head === "token") return 30;
  return 15;
}

/// Every path segment must look like this, and the URL is REBUILT from the
/// segments rather than passed through.
///
/// Checking only the first segment and forwarding the rest of the path was a
/// real hole: `/api/overlay/sync/../../whatever` passes an allow-list that only
/// looks at "sync", and `..` is then normalised away when the upstream URL is
/// parsed, landing on a route the allow-list exists to keep unreachable. The
/// index happens to serve nothing but reads today, which is exactly the
/// reasoning that lets a hole like this survive until the day it does.
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;
/// Longest real route is two segments (`token/306:2`). More than that is not a
/// route this API has.
const MAX_SEGMENTS = 2;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const raw = url.pathname.replace(/^\/api\/overlay\/?/, "");

  const segments = raw.split("/").filter((s) => s.length > 0);
  const head = segments[0] ?? "";

  if (!ALLOWED.has(head)) {
    return json({ error: "Unsupported query." }, 403);
  }
  if (segments.length > MAX_SEGMENTS || !segments.every((s) => SEGMENT.test(s))) {
    // Deliberately the same message: do not confirm which part offended.
    return json({ error: "Unsupported query." }, 403);
  }

  // Rebuilt, never forwarded. Nothing the caller wrote reaches the upstream URL
  // except segments that individually passed the check above.
  const path = segments.map(encodeURIComponent).join("/");
  const target = `${ctx.env.OVERLAY_ORIGIN.replace(/\/$/, "")}/${path}${url.search}`;

  const key = new Request(`https://overlay.cache/${path}${url.search}`, { method: "GET" });
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "X-Scan-Secret": ctx.env.SCAN_SHARED_SECRET },
      // The index is a service we run at a fixed address. If it starts
      // redirecting, something is wrong and following the redirect would send
      // our shared secret somewhere we did not choose.
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return json({ error: "The overlay index is not responding right now." }, 503);
  }

  const payload = await upstream.json().catch(() => null);
  if (!payload) {
    return json({ error: "The overlay index returned an unreadable response." }, 502);
  }
  // 404s from the index are meaningful ("no such collectible"), so they are
  // passed through rather than flattened into a generic failure.
  if (!upstream.ok) {
    return json(payload, upstream.status === 404 ? 404 : 502);
  }

  const res = json(payload, 200, cacheSeconds(head));
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
};

function json(data: unknown, status: number, maxAge = 0): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}
