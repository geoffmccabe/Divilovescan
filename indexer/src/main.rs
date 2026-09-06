//! The explorer's overlay indexer.
//!
//! There is deliberately nothing here. Every line this file used to contain now
//! lives in `dvxp-scan`, the shared scanner in the chain repo, so that the
//! explorer and the wallet cannot scan by different rules.
//!
//! ## What the old one got wrong
//!
//! It was a good first pass and it proved the parsers worked. Three things only
//! show up once it runs as a service rather than as a one-shot:
//!
//! 1. **It ran once and exited.** No resume, no tip following. A restart
//!    rescanned the whole chain.
//! 2. **It never handled a reorg.** Divi caps them at 100 blocks and they
//!    happen. A replaced block silently left the wrong owner in place.
//! 3. **Its fingerprint covered collectibles but not tokens.** DMT records were
//!    applied and then left out of the one value whose entire job is detecting
//!    that two indexers disagree.
//!
//! Fixing those in a copy that lives here would have meant two scanners to keep
//! in step, which is the divergence the shared crate exists to prevent.
//!
//! ## Running it
//!
//! Same environment variables as before, plus `API_BIND` for the read API the
//! explorer's Pages Function proxies to. See `vendor/dvxp-scan/README.md`.

fn main() -> std::process::ExitCode {
    dvxp_scan::run_daemon()
}
