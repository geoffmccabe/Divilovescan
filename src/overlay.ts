// The overlay index: tokens and collectibles.
//
// Talks to the Pages Function, never to the index directly, the same way
// `api.ts` talks to the node. See `functions/api/overlay/[[route]].ts`.
//
// Two rules that come from the index and must survive the trip into the UI:
//
//   1. **Amounts are strings.** A token with 8 decimals and a large supply
//      exceeds what a JavaScript number holds exactly. Never `Number()` an
//      amount; format it with `formatAmount` below, which does the arithmetic
//      on the digits.
//   2. **Every answer carries `sync`.** It says which block the answer was true
//      at and whether the index is behind or stopped. A page that shows overlay
//      data without showing that is claiming a freshness it cannot vouch for.

export interface SyncState {
  height: number;
  tip: number;
  behind: number;
  fingerprint: string;
  halted: boolean;
  haltReason: string | null;
  trustworthy: boolean;
}

export interface TokenMeta {
  tokenId: string;
  ticker: string;
  decimals: number;
  /** Integer string in the smallest unit. */
  totalSupply: string;
  maxSupply: string | null;
  supplyLocked: boolean;
  issuer: string;
  mintOpen: boolean;
  genesisTxid: string | null;
  /** Where a name and artwork live, if the issuer published any. */
  metadataPtr: string | null;
}

export interface TokenBalance {
  tokenId: string;
  amount: string;
}

export type HistoryKind = "issue" | "mint" | "transfer-in" | "transfer-out" | "burn";

export interface HistoryEvent {
  kind: HistoryKind;
  tokenId: string;
  counterparty: string | null;
  amount: string;
  height: number;
  txid: string;
  blockTime: number;
}

export interface Nfd {
  id: string;
  owner: string;
  arweavePtr: string;
  contentHash: string;
  /** Absent when the creator published no preview. */
  thumbPtr: string | null;
  collectionId: string | null;
  mintHeight: number;
}

export interface Collection {
  id: string;
  creator: string;
  /** 0 means uncapped. */
  maxSupply: number;
  minted: number;
  metaPtr: string;
}

export interface Envelope<T> {
  data: T;
  sync: SyncState;
}

/** Thrown when the index answers, and the answer is "no". */
export class OverlayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<Envelope<T>> {
  const res = await fetch(`/api/overlay/${path}`);
  const body = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { sync?: SyncState; error?: string })
    | null;

  if (!body) throw new OverlayError("The index returned an unreadable response.", res.status);
  if (!res.ok || body.error) {
    throw new OverlayError(body.error ?? "That query failed.", res.status);
  }
  // `sync` travels alongside the payload rather than inside it, so callers get
  // both without the shapes having to know about each other.
  const { sync, ...rest } = body;
  return { data: rest as T, sync: sync as SyncState };
}

export interface Stats {
  tokens: number;
  tokenHolders: number;
  collectibles: number;
  collections: number;
  creators: number;
}

export const stats = () => get<Stats>("stats");
export const allTokens = () => get<{ tokens: TokenMeta[] }>("tokens");
export const token = (id: string) =>
  get<{ token: TokenMeta; history: HistoryEvent[] }>(`token/${encodeURIComponent(id)}`);
export const nfd = (id: string) => get<{ nfd: Nfd }>(`nfd/${encodeURIComponent(id)}`);
export const nfdsOwnedBy = (owner: string) =>
  get<{ nfds: Nfd[] }>(`nfds?owner=${encodeURIComponent(owner)}`);
export const collection = (id: string) =>
  get<{ collection: Collection; members: Nfd[] }>(`collection/${encodeURIComponent(id)}`);
export const balances = (addresses: string[]) =>
  get<{ balances: TokenBalance[] }>(`balances?addresses=${addresses.map(encodeURIComponent).join(",")}`);
export const history = (addresses: string[], limit = 50) =>
  get<{ events: HistoryEvent[] }>(
    `history?addresses=${addresses.map(encodeURIComponent).join(",")}&limit=${limit}`,
  );

/**
 * A 32-byte storage pointer, hex as the chain holds it, to the base64url form
 * the storage system addresses it by.
 *
 * The chain stores 32 raw bytes and the API hands them over as hex, like every
 * other 32-byte value. Arweave names the same bytes in base64url: 43 characters,
 * no padding. Two spellings of one id, and the conversion has to happen
 * somewhere. It happens here, at the point where a pointer stops being data and
 * becomes a place to fetch from.
 *
 * Returns null for anything that is not 32 bytes of hex, rather than building a
 * URL that cannot work.
 */
export function pointerToStorageId(hex: string): string | null {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The URL for a collectible's preview.
 *
 * Always same-origin. Nothing on this site points a browser at a storage
 * gateway: previews pass through a function we control so the moderation
 * blocklist has somewhere to be enforced, so a pointer that turns out to hold
 * HTML cannot become script on our own origin, and so visitors' addresses are
 * not handed to a third party for every thumbnail on the page.
 */
export function previewUrl(thumbPtr: string | null): string | null {
  if (!thumbPtr) return null;
  const id = pointerToStorageId(thumbPtr);
  if (!id) return null;
  return `/api/nfd-image/${id}`;
}

/**
 * Render a smallest-unit integer string using the token's decimals.
 *
 * String arithmetic on purpose. A token with 8 decimals and a large supply
 * exceeds what a double represents exactly, and silently rounding somebody's
 * balance is not acceptable.
 */
export function formatAmount(amount: string, decimals: number): string {
  const negative = amount.startsWith("-");
  const digits = (negative ? amount.slice(1) : amount).replace(/\D/g, "") || "0";

  if (decimals <= 0) {
    // Indivisible: whole units, never a decimal point. You cannot own half a
    // ticket.
    return (negative ? "-" : "") + BigInt(digits).toLocaleString();
  }
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");
  const wholeFormatted = BigInt(whole).toLocaleString();
  return (negative ? "-" : "") + (fraction ? `${wholeFormatted}.${fraction}` : wholeFormatted);
}

/** Short form of a 64-character id, for tables. */
export function shortId(id: string, keep = 8): string {
  return id.length <= keep * 2 + 1 ? id : `${id.slice(0, keep)}…${id.slice(-keep)}`;
}
