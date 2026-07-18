// Cloudflare Pages Function: the ONLY bridge between the public web and the Divi node.
//
// Security posture, deliberately paranoid because this repo is public and the
// node behind it holds a live wallet:
//   * Strict method allow-list. Anything not named here is rejected outright —
//     a deny-list would be one Divi release away from leaking a wallet call.
//   * Credentials live in Cloudflare secrets, never in this repo.
//   * The node is reached through a Cloudflare Tunnel, so it has no public IP
//     and no inbound ports open.
//   * Responses are cached at the edge so the node sees a trickle of traffic
//     no matter how busy the explorer gets.

interface Env {
  DIVI_RPC_URL: string;
  DIVI_RPC_USER: string;
  DIVI_RPC_PASS: string;
}

// Read-only chain queries. NOTHING that touches the wallet, keys, peers, or
// node control belongs in this list — not even read-only wallet calls, since
// they would expose the operator's balances.
const ALLOWED = new Set([
  "getblockchaininfo",
  "getblockcount",
  "getblockhash",
  "getblock",
  "getrawtransaction",
  "getaddressbalance",
  "getaddresstxids",
  "getaddressutxos",
  "getaddressdeltas",
  "getspentinfo",
  "getlotteryblockwinners",
]);

// Confirmed chain data is immutable, so it can cache effectively forever. Tip
// data must stay fresh. Anything unknown gets the cautious short TTL.
function cacheSeconds(method: string, params: unknown[]): number {
  if (method === "getblockcount" || method === "getblockchaininfo") return 10;
  // A block/tx lookup by hash can never change its answer.
  if (method === "getblock" || method === "getrawtransaction") return 31536000;
  // Height→hash is immutable once buried, but a recent height could still reorg.
  if (method === "getblockhash") return 60;
  return 15;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: { method?: string; params?: unknown[] };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const method = String(body.method ?? "");
  const params = Array.isArray(body.params) ? body.params : [];

  if (!ALLOWED.has(method)) {
    // Deliberately vague: don't confirm whether a method exists on the node.
    return json({ error: "Unsupported query." }, 403);
  }

  // Edge cache keyed on the exact query. A cache hit never reaches the node.
  const key = new Request(
    `https://rpc.cache/${method}/${encodeURIComponent(JSON.stringify(params))}`,
    { method: "GET" },
  );
  // `caches.default` is a Cloudflare extension; the bundled DOM typings model
  // only the standard CacheStorage, hence the narrow assertion here.
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(ctx.env.DIVI_RPC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + btoa(`${ctx.env.DIVI_RPC_USER}:${ctx.env.DIVI_RPC_PASS}`),
      },
      body: JSON.stringify({ jsonrpc: "1.0", id: "scan", method, params }),
      // The node is normally sub-second; a hung call must not hold a Worker open.
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return json({ error: "The Divi node is not responding right now." }, 503);
  }

  if (!upstream.ok) {
    return json({ error: "The Divi node rejected that query." }, 502);
  }

  const payload = (await upstream.json()) as { result?: unknown; error?: { message?: string } };
  if (payload.error) {
    // Pass the node's own message through — these are user-meaningful things
    // like "No information available for address", not internal details.
    return json({ error: payload.error.message ?? "Query failed." }, 404);
  }

  const res = json({ result: payload.result }, 200, cacheSeconds(method, params));
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
