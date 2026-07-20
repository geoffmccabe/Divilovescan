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
for c in dvxp-core nfd-indexer dmt-indexer; do
  cp -R "$SRC/contrib/$c" "$DEST/$c"
done
( cd "$SRC" && git log -1 --format='%H %cI %s' ) > "$DEST/UPSTREAM"
echo "vendored from $(cat "$DEST/UPSTREAM")"
