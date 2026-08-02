// Cloudflare Pages Function: the ONLY bridge between the public web and the DIVA
// (EVM side-chain) node. Mirrors the paranoid posture of /api/rpc:
//   * Strict read-only method allow-list (deny everything else).
//   * The node is reached through a Cloudflare Tunnel, no public IP.
//   * Responses cached at the edge.
//
// NOTE: DIVA is currently a throwaway devnet with worthless coins, reached via a
// temporary cloudflared quick tunnel. The origin below is the fallback used when
// no DIVA_ORIGIN secret is set; replace both with a stable named tunnel + secret
// once DIVA lives on an always-on node.

interface Env {
  DIVA_ORIGIN?: string;
}

const FALLBACK_ORIGIN = "https://hugh-keep-evolution-drain.trycloudflare.com";

const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getCode",
  "net_version",
  "web3_clientVersion",
]);

function cacheSeconds(method: string): number {
  if (method === "eth_blockNumber" || method === "eth_gasPrice") return 5;
  if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") return 15;
  if (method === "eth_getTransactionByHash" || method === "eth_getTransactionReceipt") return 60;
  return 10;
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
    return json({ error: "Unsupported query." }, 403);
  }

  const origin = ctx.env.DIVA_ORIGIN || FALLBACK_ORIGIN;

  const key = new Request(
    `https://diva.cache/${method}/${encodeURIComponent(JSON.stringify(params))}`,
    { method: "GET" },
  );
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(origin, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return json({ error: "The DIVA node is not responding right now." }, 503);
  }

  // The DIVA proxy forwards geth's shape: {result} on success, {error:{message}}.
  const payload = (await upstream.json().catch(() => null)) as
    | { result?: unknown; error?: unknown }
    | null;

  if (!payload) {
    return json({ error: "The DIVA node returned an unreadable response." }, 502);
  }
  if (payload.error) {
    const msg =
      typeof payload.error === "string"
        ? payload.error
        : (payload.error as { message?: string })?.message ?? "DIVA node error";
    return json({ error: msg }, 404);
  }

  const res = json({ result: payload.result }, 200, cacheSeconds(method));
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
