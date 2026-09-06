#!/bin/bash
# Copies the upstream indexer crates in, recording exactly which commit.
#
# They are NOT forked: this repo must never carry a second copy of the protocol
# rules that could drift from the chain repo's. Re-run after any upstream change.
set -e
SRC="${1:-$HOME/Divi-Blockchain_6.9}"
DEST="$(dirname "$0")/vendor"
[ -d "$SRC/contrib/dvxp-core" ] || { echo "chain repo not found at $SRC"; exit 1; }

rm -rf "$DEST"; mkdir -p "$DEST"
# dvxp-scan is the scanner itself. This repo used to carry its own; that one
# ran once and exited, never handled a reorg, and its fingerprint covered
# collectibles but not tokens. The shared crate is now the only scanner, so the
# explorer and the wallet provably scan by the same rules.
# name-registry is here because dmt-indexer depends on it (Divi Names shares the
# ticker rules). It was missing until 2026-Sep-06, which meant the vendored set
# had quietly stopped building: the copy was made before dmt-indexer grew that
# dependency, and nothing re-ran this script afterwards to notice.
for c in dvxp-core name-registry nfd-indexer dmt-indexer dvxp-scan; do
  cp -R "$SRC/contrib/$c" "$DEST/$c"
  # Build output must never be vendored.
  rm -rf "$DEST/$c/target"
done
( cd "$SRC" && git log -1 --format='%H %cI %s' ) > "$DEST/UPSTREAM"
echo "vendored from $(cat "$DEST/UPSTREAM")"
