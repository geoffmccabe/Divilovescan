// Local stand-in for the Cloudflare Pages Function.
//
// In production the browser talks to functions/api/rpc.ts. There is no Pages
// runtime in `vite dev`, so this tiny server plays the same role and enforces
// the SAME allow-list — if these ever drift, dev would pass while production
// rejects the call.
//
// Credentials come from the environment, never from a file in the repo:
//   DIVI_RPC_URL=http://127.0.0.1:51500/ DIVI_RPC_USER=... DIVI_RPC_PASS=... \
//     node scripts/dev-api.mjs

import { createServer } from "node:http";

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

const URL_ = process.env.DIVI_RPC_URL || "http://127.0.0.1:51500/";
const USER = process.env.DIVI_RPC_USER || "";
const PASS = process.env.DIVI_RPC_PASS || "";
const PORT = Number(process.env.DEV_API_PORT || 5174);

createServer((req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.method !== "POST") return send(405, { error: "POST only." });

  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(400, { error: "Malformed request." });
    }
    if (!ALLOWED.has(body.method)) return send(403, { error: "Unsupported query." });

    try {
      const up = await fetch(URL_, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64"),
        },
        body: JSON.stringify({ jsonrpc: "1.0", id: "dev", method: body.method, params: body.params ?? [] }),
        signal: AbortSignal.timeout(20000),
      });
      const payload = await up.json();
      if (payload.error) return send(404, { error: payload.error.message ?? "Query failed." });
      send(200, { result: payload.result });
    } catch (e) {
      send(503, { error: `Node unreachable: ${e.message}` });
    }
  });
}).listen(PORT, () => console.log(`dev api on http://127.0.0.1:${PORT} -> ${URL_}`));
