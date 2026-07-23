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
  /** Block time; only the fork snapshot carries it (getchaintips does not). */
  time?: number | null;
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

// --- chain-scan index (our own, because the node cannot answer these) ---

export interface ScanSummary {
  height: number;
  tx_total: number;
  tx_nonstake: number;
  sum_total: number;
  sum_vaulted: number;
  holders: number;
  delegates: number;
  delegators: number;
  addresses: number;
  senders: number;
  summary_built: number;
  fees_burned_total: number;
}
export const scanSummary = () => rpc<ScanSummary>("scan_summary");

export interface RichRow {
  rank: number;
  address: string;
  balance: number;
  vaulted: number;
  utxos: number;
}
export interface RichList {
  total: number;
  holders: number;
  builtAt: number;
  rows: RichRow[];
}
export const scanRichList = (limit = 100, offset = 0) =>
  rpc<RichList>("scan_richlist", [limit, offset]);

export interface Delegation {
  address: string;
  amount: number;
}
export interface ScanAddress {
  balance: number;
  vaulted: number;
  utxos: number;
  builtAt: number;
  /** Delegates staking this address's coins on its behalf. */
  stakedBy: Delegation[];
  /** Owners whose coins this address stakes. */
  stakesFor: Delegation[];
  stakesForTotal: number;
}
export const scanAddress = (address: string) => rpc<ScanAddress>("scan_address", [address]);

// --- network map ---

export interface Peer {
  ip: string;
  inbound: boolean;
  pingMs: number;
  connSecs: number;
  bytesSent: number;
  bytesRecv: number;
  subver: string;
  height: number;
}
export interface PeerSnapshot {
  peers: Peer[];
  /** Our own public address, as the majority of peers report seeing us. */
  selfIp: string | null;
}
export const scanPeers = () => rpc<PeerSnapshot>("scan_peers");

export interface Geo {
  ip: string;
  lat: number;
  lon: number;
  city: string;
  country: string;
  isp?: string;
}
/** Locations are cached server-side forever — an IP's city doesn't move. */
export const scanGeo = (ips: string[]) => rpc<Geo[]>("scan_geo", [ips]);

export interface Probe {
  ip: string;
  online: boolean;
  /** TCP round-trip in ms; 0 when unreachable. */
  ms: number;
}
export const scanProbe = (ips: string[]) => rpc<Probe[]>("scan_probe", [ips]);

// --- chart series ---

export interface DayRow {
  d: string;      // YYYY-MM-DD
  blocks: number;
  txs: number;    // all transactions
  pay: number;    // real payments (staking/coinbase excluded)
  supply: number | null;  // satoshi at the day's last block
  diff: number | null;
  neww: number;   // wallets first seen that day
  win: number | null;  // distinct wallets that won a block; null = not scanned yet
  burn: number;        // fees burned that day, satoshi
}
export interface Series {
  builtAt: number;
  days: DayRow[];
}
export const scanSeries = () => rpc<Series>("scan_series");

export interface KnownNode {
  ip: string;
  lastSeen: number;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
}
/** Every node seen in the last 30 days — accumulated on the server, so a first
 *  visit already shows the wider network rather than an empty map. */
export const scanKnown = () => rpc<KnownNode[]>("scan_known");

// --- lottery block anatomy ---

/**
 * A lottery block's coinstake pays the staker AND the eleven lottery winners
 * from the same transaction, which is why it reads as one confusing list:
 *
 *   output 0     value 0, nonstandard  — the marker that makes this a coinstake
 *   output 1     the STAKER's own coins back, plus the block reward
 *   output 2..n  the lottery payouts: one big win, then ten small ones
 *
 * The big win is exactly 10x a small one. Verified on block 4,132,800:
 * staked 15,767.49779392 + 498 reward = 16,265.49779392 to the staker, then
 * 252,000 to one winner and 25,200 to each of ten more.
 */
export interface LotteryPayouts {
  /** Index of the staker's own return, or null if it can't be identified. */
  stakerIndex: number | null;
  /** Output index of the single big winner. */
  bigIndex: number | null;
  /** Output indexes of the small winners. */
  smallIndexes: number[];
  winnerCount: number;
}

export function lotteryPayouts(vout: Vout[], stakedInput: number | null): LotteryPayouts {
  // Everything with value; the zero-value marker is never a payout.
  const paid = vout.filter((o) => (o.value || 0) > 0);
  if (paid.length < 2) {
    return { stakerIndex: null, bigIndex: null, smallIndexes: [], winnerCount: 0 };
  }

  // The staker's return is the output that gives their stake back. Identified by
  // value rather than position, so an ordering change can't mislabel a winner as
  // the staker.
  let stakerIndex: number | null = null;
  if (stakedInput != null && stakedInput > 0) {
    const match = paid.find((o) => (o.value || 0) >= stakedInput);
    if (match) stakerIndex = match.n;
  }
  if (stakerIndex == null) stakerIndex = paid[0].n;

  const winners = paid.filter((o) => o.n !== stakerIndex);
  if (!winners.length) {
    return { stakerIndex, bigIndex: null, smallIndexes: [], winnerCount: 0 };
  }
  const top = winners.reduce((m, o) => ((o.value || 0) > (m.value || 0) ? o : m), winners[0]);
  return {
    stakerIndex,
    bigIndex: top.n,
    smallIndexes: winners.filter((o) => o.n !== top.n).map((o) => o.n),
    winnerCount: winners.length,
  };
}
