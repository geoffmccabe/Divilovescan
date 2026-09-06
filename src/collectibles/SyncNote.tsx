import type { SyncState } from "../overlay";

// Where the overlay index had got to when it answered.
//
// This is not decoration. Overlay data is an interpretation of chain records
// made by a separate process, and that process can be behind, or stopped. A
// page that shows a collectible's owner without saying which block that was
// true at is claiming a freshness nobody verified.
//
// Three states, three different things to say:
//   current  — quiet. Say the height and get out of the way.
//   behind   — say how far, because "12 blocks" and "3 days" mean different
//              things to a reader deciding whether to trust what they see.
//   halted   — loud. The index stopped rather than guess, which is the
//              designed behaviour, and everything on the page is frozen at
//              whatever it last knew.

/** Divi targets one block a minute, so blocks convert straight to minutes. */
function behindInWords(blocks: number): string {
  if (blocks < 60) return `${blocks} block${blocks === 1 ? "" : "s"}`;
  const hours = Math.floor(blocks / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `about ${days} day${days === 1 ? "" : "s"}`;
}

export function SyncNote({ sync }: { sync: SyncState | null }) {
  if (!sync) return null;

  if (sync.halted) {
    return (
      <p className="nfd-sync nfd-sync-halted">
        <strong>The collectibles index has stopped.</strong>{" "}
        {sync.haltReason ?? "It found a record this version cannot read."} It stopped rather than
        guess, so what you see below is frozen at block {sync.height.toLocaleString()} and may no
        longer be true.
      </p>
    );
  }

  if (sync.behind > 2) {
    return (
      <p className="nfd-sync nfd-sync-behind">
        Catching up: {behindInWords(sync.behind)} behind the chain. Shown as of block{" "}
        {sync.height.toLocaleString()}, so very recent transfers may be missing.
      </p>
    );
  }

  return (
    <p className="nfd-sync">
      As of block {sync.height.toLocaleString()}.{" "}
      <span
        className="mono nfd-fingerprint"
        title="A running fingerprint of the overlay ledger. Anyone running their own indexer should compute the same value: that is how two independent implementations detect a disagreement immediately."
      >
        {sync.fingerprint.slice(0, 12)}…
      </span>
    </p>
  );
}
