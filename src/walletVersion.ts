// Single source of truth for the downloadable wallet's version. The macOS app
// bundle is named "Divi Desktop <version>" (set at build time from the same
// version), so the unlock command's path and the download filenames all derive
// from here and can never drift from what the DMG actually contains.
export const WALLET_VERSION = "69.0.3";
export const MAC_APP = `Divi Desktop ${WALLET_VERSION}.app`;
// The macOS build is a Universal binary (Apple Silicon + Intel) as of 69.0.3.
export const MAC_DMG = `Divi-Desktop-${WALLET_VERSION}-Universal.dmg`;
// Linux now matches the Mac version.
export const LINUX_VERSION = "69.0.3";
export const LINUX_DEB = `Divi-Desktop-${LINUX_VERSION}-Linux-x86_64.deb`;
// Windows is an EXPERIMENTAL test build: unsigned, and the bundled node daemon
// is not published for Windows yet, so blockchain sync won't run there.
export const WIN_EXE = `Divi-Desktop-${WALLET_VERSION}-Windows-x64-setup.exe`;
