// Talks to the Pages Function, never to the node directly.

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? "Query failed.");
  return body.result as T;
}

export interface ChainInfo {
  blocks: number;
  difficulty: number;
  moneysupply?: number;
}

export interface Vout {
  value: number;
  n: number;
  scriptPubKey: { addresses?: string[]; type?: string };
}
export interface Vin {
  txid?: string;
  vout?: number;
  coinbase?: string;
}
export interface RawTx {
  txid: string;
  vin: Vin[];
  vout: Vout[];
  blockhash?: string;
  blocktime?: number;
  confirmations?: number;
}

export interface BlockSummary {
  hash: string;
  height: number;
  time: number;
  txCount: number;
  isPoS: boolean;
  /** Address that won the stake, when this is a Proof-of-Stake block. */
  stakeWinner: string | null;
  /** Reward only — the staked input is netted out, not counted as earnings. */
  stakeReward: number | null;
}

// --- block list ---

export interface BlockRow {
  height: number;
  hash: string;
  time: number;
  txCount: number;
  size: number | null;
}

/**
 * A page of the block list, assembled on the node rather than here. Asking the
 * browser for 1000 blocks one at a time would be thousands of round trips; this
 * is a single request.
 */
export const blockRange = (start: number, count: number) =>
  rpc<BlockRow[]>("scan_blockrange", [start, count]);

// Divi's proof-of-work ended at block 100 — every block since is a stake, so
// "is this a stake block?" is not a useful thing to display. What IS useful is
// the weekly superblocks, whose heights are fixed by consensus:
//   lottery  — height % 10080 == 0   (nLotteryBlockCycle)
//   treasury — height % 10081 == 0   (nTreasuryPaymentsCycle)
// Both are still stake blocks; they simply carry extra payout outputs.
export const LAST_POW_BLOCK = 100;
export const LOTTERY_CYCLE = 10080;
export const TREASURY_CYCLE = 10081;
export const SUPERBLOCK_START = 101;

export const isLotteryBlock = (h: number) => h >= SUPERBLOCK_START && h % LOTTERY_CYCLE === 0;
export const isTreasuryBlock = (h: number) => h >= SUPERBLOCK_START && h % TREASURY_CYCLE === 0;
export const isProofOfWork = (h: number) => h <= LAST_POW_BLOCK;

export const getChainInfo = () => rpc<ChainInfo>("getblockchaininfo");
export const getBlockCount = () => rpc<number>("getblockcount");
export const getBlockHash = (height: number) => rpc<string>("getblockhash", [height]);
export const getBlockRaw = (hash: string) => rpc<any>("getblock", [hash]);
export const getTx = (txid: string) => rpc<RawTx>("getrawtransaction", [txid, 1]);
/** The transaction exactly as it exists on the chain, with no interpretation. */
export const getTxHex = (txid: string) => rpc<string>("getrawtransaction", [txid, 0]);

/**
 * Divi is a Proof-of-Stake chain, so nearly every block is won by a staker
 * rather than mined. A coinstake transaction is recognisable by its first
 * output being empty (value 0) — that marker is what distinguishes it from an
 * ordinary payment.
 *
 * The reward is NOT the coinstake's total output: that total includes the
 * staker's own coins being returned to them. Showing the gross figure would
 * wildly overstate earnings, which is the mistake generic explorers make on
 * PoS chains. We subtract the inputs to show what was actually created.
 */
export async function summariseBlock(hash: string): Promise<BlockSummary> {
  const b = await getBlockRaw(hash);
  const txids: string[] = b.tx ?? [];

  let isPoS = false;
  let stakeWinner: string | null = null;
  let stakeReward: number | null = null;

  // The coinstake is always the second transaction in a PoS block.
  if (txids.length > 1) {
    try {
      const cs = await getTx(txids[1]);
      const firstOutEmpty = cs.vout.length > 0 && cs.vout[0].value === 0;
      if (firstOutEmpty) {
        isPoS = true;
        stakeWinner =
          cs.vout.find((o) => o.scriptPubKey?.addresses?.length)?.scriptPubKey.addresses?.[0] ?? null;

        const out = cs.vout.reduce((s, o) => s + (o.value || 0), 0);
        // Resolve each input's value to subtract the staker's own returned coins.
        const ins = await Promise.all(
          cs.vin
            .filter((v) => v.txid !== undefined)
            .map(async (v) => {
              try {
                const prev = await getTx(v.txid!);
                return prev.vout[v.vout ?? 0]?.value ?? 0;
              } catch {
                return 0;
              }
            }),
        );
        const staked = ins.reduce((s, v) => s + v, 0);
        // Guard against a failed input lookup producing a nonsense figure.
        stakeReward = staked > 0 ? Math.max(0, out - staked) : null;
      }
    } catch {
      /* fall through as a non-PoS block rather than failing the whole page */
    }
  }

  return {
    hash: b.hash,
    height: b.height,
    time: b.time,
    txCount: txids.length,
    isPoS,
    stakeWinner,
    stakeReward,
  };
}

export async function getRecentBlocks(count: number): Promise<BlockSummary[]> {
  const tip = await getBlockCount();
  const heights = Array.from({ length: count }, (_, i) => tip - i).filter((h) => h >= 0);
  const hashes = await Promise.all(heights.map(getBlockHash));
  return Promise.all(hashes.map(summariseBlock));
}

// --- address lookups (require the node's address index to be enabled) ---

export interface AddressBalance {
  balance: number;
  received: number;
}
export const getAddressBalance = (address: string) =>
  rpc<AddressBalance>("getaddressbalance", [{ addresses: [address] }]);
export const getAddressTxids = (address: string) =>
  rpc<string[]>("getaddresstxids", [{ addresses: [address] }]);

// --- node-level views (server-side cached: getchaintips stalls the node ~18s) ---

export interface ChainTip {
  height: number;
  hash: string;
  branchlen: number;
  status: string;
}
export const getChainTips = () => rpc<ChainTip[]>("getchaintips");

export interface PeerInfo {
  addr: string;
  subver?: string;
  inbound?: boolean;
  pingtime?: number;
  conntime?: number;
  startingheight?: number;
  bytessent?: number;
  bytesrecv?: number;
}
export const getPeerInfo = () => rpc<PeerInfo[]>("getpeerinfo");

export interface NodeInfo {
  version?: number;
  protocolversion?: number;
  blocks?: number;
  connections?: number;
  difficulty?: number;
  moneysupply?: number;
  testnet?: boolean;
}
export const getNodeInfo = () => rpc<NodeInfo>("getinfo");
