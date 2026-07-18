// Byte-by-byte parser for a raw Divi transaction, used by the Transaction
// Inspector to explain every field to a newcomer.
//
// The format is verified against Divi Core (primitives/transaction.h):
//
//   int32   nVersion
//   varint  input count
//     [ 32 bytes prev tx hash | uint32 prev index | varint len | scriptSig | uint32 sequence ]
//   varint  output count
//     [ int64 value | varint len | scriptPubKey ]
//   uint32  nLockTime
//
// Two Divi-specific facts worth teaching, both confirmed in that header:
//   * There is NO witness section — Divi predates SegWit, so signatures sit
//     inline in scriptSig rather than in a separate area.
//   * There is NO per-transaction timestamp. Many Proof-of-Stake coins inherit
//     one from Peercoin; in Divi that field is commented out of the source.

export interface Span {
  /** Byte offset into the raw transaction. */
  offset: number;
  /** The raw hex for this field. */
  hex: string;
  /** Short field name, e.g. "Version". */
  label: string;
  /** Decoded human value, e.g. "1" or "12,420.49 DIVI". */
  value: string;
  /** Plain-English explanation aimed at someone learning how a chain works. */
  explain: string;
  /** Set when the field behaves differently on Divi than on Bitcoin. */
  diviNote?: string;
  /** Grouping label for the sidebar, e.g. "Input 1". */
  group: string;
}

class Reader {
  constructor(
    private hex: string,
    public pos = 0,
  ) {}
  get done() {
    return this.pos >= this.hex.length;
  }
  /** Reads `n` bytes and returns them as hex, advancing the cursor. */
  take(n: number): string {
    const s = this.hex.slice(this.pos, this.pos + n * 2);
    this.pos += n * 2;
    return s;
  }
  peekByte(): number {
    return parseInt(this.hex.slice(this.pos, this.pos + 2), 16);
  }
}

const leToNumber = (hex: string): number => {
  // Little-endian: the bytes read right-to-left. Uses BigInt so an 8-byte
  // value can't silently lose precision.
  let v = 0n;
  for (let i = hex.length - 2; i >= 0; i -= 2) v = (v << 8n) | BigInt(parseInt(hex.slice(i, i + 2), 16));
  return Number(v);
};

const reverseHex = (hex: string): string =>
  (hex.match(/../g) ?? []).reverse().join("");

/** CompactSize: 1, 3, 5 or 9 bytes depending on the first byte's value. */
function readVarint(r: Reader): { hex: string; value: number } {
  const first = r.peekByte();
  if (first < 0xfd) return { hex: r.take(1), value: first };
  const marker = r.take(1);
  const width = first === 0xfd ? 2 : first === 0xfe ? 4 : 8;
  const rest = r.take(width);
  return { hex: marker + rest, value: leToNumber(rest) };
}

const VARINT_EXPLAIN =
  "A count stored in a space-saving way. Small numbers take one byte; larger ones are " +
  "flagged by a marker byte (fd, fe or ff) that says how many bytes follow. Bitcoin " +
  "invented this to keep transactions small, and Divi inherited it.";

export function parseRawTx(rawHex: string): Span[] {
  const hex = rawHex.trim().toLowerCase();
  const spans: Span[] = [];
  const r = new Reader(hex);
  const push = (s: Omit<Span, "offset">, offsetBytes: number) =>
    spans.push({ ...s, offset: offsetBytes });

  // --- version ---
  let at = r.pos / 2;
  const version = r.take(4);
  push(
    {
      hex: version,
      label: "Version",
      value: String(leToNumber(version)),
      group: "Header",
      explain:
        "The transaction format number. It tells the network which rules to apply when " +
        "reading the rest of these bytes, so the format can be upgraded later without " +
        "breaking old transactions. Stored back-to-front (little-endian), which is why " +
        "version 1 appears as 01000000.",
    },
    at,
  );

  // --- inputs ---
  at = r.pos / 2;
  const vinCount = readVarint(r);
  push(
    {
      hex: vinCount.hex,
      label: "Input count",
      value: `${vinCount.value} input${vinCount.value === 1 ? "" : "s"}`,
      group: "Header",
      explain:
        `How many separate chunks of coin this transaction spends. ${VARINT_EXPLAIN}`,
    },
    at,
  );

  for (let i = 0; i < vinCount.value; i++) {
    const group = `Input ${i + 1}`;

    at = r.pos / 2;
    const prev = r.take(32);
    const isCoinbaseish = /^0+$/.test(prev);
    push(
      {
        hex: prev,
        label: "Previous transaction",
        value: isCoinbaseish ? "none — newly created coins" : reverseHex(prev),
        group,
        explain: isCoinbaseish
          ? "All zeroes. This input doesn't come from an earlier transaction because the " +
            "coins are being created here — this is a block reward or a staking reward."
          : "The fingerprint (hash) of the earlier transaction that produced the coins being " +
            "spent. Coins are never 'in' an account — they exist as outputs of past " +
            "transactions, and spending means pointing back at one. Note the bytes are stored " +
            "reversed, so the ID shown on explorers is this hex backwards.",
      },
      at,
    );

    at = r.pos / 2;
    const idx = r.take(4);
    push(
      {
        hex: idx,
        label: "Output index",
        value: leToNumber(idx) === 0xffffffff ? "ffffffff (none)" : String(leToNumber(idx)),
        group,
        explain:
          "Which output of that earlier transaction is being spent. A transaction can pay " +
          "several people at once, so this picks one of them — counting from zero.",
      },
      at,
    );

    at = r.pos / 2;
    const slen = readVarint(r);
    push(
      {
        hex: slen.hex,
        label: "Unlocking script length",
        value: `${slen.value} bytes`,
        group,
        explain: `How long the unlocking script below is. ${VARINT_EXPLAIN}`,
      },
      at,
    );

    at = r.pos / 2;
    const script = r.take(slen.value);
    push(
      {
        hex: script,
        label: "Unlocking script (scriptSig)",
        value: `${slen.value} bytes`,
        group,
        explain:
          "The proof that you're allowed to spend those coins — normally a digital signature " +
          "plus the public key it corresponds to. The earlier output set a puzzle; this is the " +
          "answer. Anyone can verify the signature matches, but only the private key holder " +
          "could have produced it.",
        diviNote:
          "On Bitcoin since 2017 signatures live in a separate 'witness' section. Divi has no " +
          "SegWit, so the signature sits right here inside the transaction.",
      },
      at,
    );

    at = r.pos / 2;
    const seq = r.take(4);
    push(
      {
        hex: seq,
        label: "Sequence",
        value: leToNumber(seq) === 0xffffffff ? "ffffffff (final)" : String(leToNumber(seq)),
        group,
        explain:
          "Originally meant for replacing an unconfirmed transaction with an updated version. " +
          "That idea was never used as planned, so it's almost always ffffffff, meaning " +
          "'this is final'. It now also signals opt-in to certain time-lock features.",
      },
      at,
    );
  }

  // --- outputs ---
  at = r.pos / 2;
  const voutCount = readVarint(r);
  push(
    {
      hex: voutCount.hex,
      label: "Output count",
      value: `${voutCount.value} output${voutCount.value === 1 ? "" : "s"}`,
      group: "Header",
      explain: `How many destinations this transaction pays. ${VARINT_EXPLAIN}`,
    },
    at,
  );

  for (let i = 0; i < voutCount.value; i++) {
    const group = `Output ${i + 1}`;

    at = r.pos / 2;
    const val = r.take(8);
    const sats = leToNumber(val);
    const isEmptyFirst = i === 0 && sats === 0;
    push(
      {
        hex: val,
        label: "Amount",
        value: `${(sats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })} DIVI`,
        group,
        explain:
          "How much is being sent, counted in the smallest unit (100,000,000 of them make one " +
          "DIVI) so computers never deal in fractions. Stored back-to-front like the version.",
        diviNote: isEmptyFirst
          ? "This first output is empty (zero). That is exactly how a staking transaction is " +
            "marked on Divi — an empty first output means this block was won by staking rather " +
            "than being an ordinary payment."
          : undefined,
      },
      at,
    );

    at = r.pos / 2;
    const plen = readVarint(r);
    push(
      {
        hex: plen.hex,
        label: "Locking script length",
        value: `${plen.value} bytes`,
        group,
        explain: `How long the locking script below is. ${VARINT_EXPLAIN}`,
      },
      at,
    );

    at = r.pos / 2;
    const pk = r.take(plen.value);
    push(
      {
        hex: pk,
        label: "Locking script (scriptPubKey)",
        value: plen.value === 0 ? "empty" : `${plen.value} bytes`,
        group,
        explain:
          "The puzzle that locks these coins, which in practice means 'whoever can prove they " +
          "own this address'. This is what an address really is under the surface — a short way " +
          "of writing this condition. Spending later means supplying an unlocking script that " +
          "satisfies it.",
      },
      at,
    );
  }

  // --- locktime ---
  at = r.pos / 2;
  const lock = r.take(4);
  const lockVal = leToNumber(lock);
  push(
    {
      hex: lock,
      label: "Lock time",
      value:
        lockVal === 0
          ? "0 — spendable immediately"
          : lockVal < 500000000
            ? `block ${lockVal}`
            : new Date(lockVal * 1000).toLocaleString(),
      group: "Footer",
      explain:
        "The earliest point this transaction may be included in a block. Zero means 'right " +
        "away', which is almost always the case. Below 500,000,000 it's read as a block height; " +
        "above that, as a date and time.",
    },
    at,
  );

  return spans;
}

/** Bytes present in the raw hex that the parser did not account for. */
export function trailing(rawHex: string, spans: Span[]): string {
  const consumed = spans.reduce((n, s) => n + s.hex.length, 0);
  return rawHex.trim().toLowerCase().slice(consumed);
}
