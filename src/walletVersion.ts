// Single source of truth for the downloadable wallet's version. The macOS app
// bundle is named "Divi Desktop <version>" (set at build time from the same
// version), so the unlock command's path and the download filenames all derive
// from here and can never drift from what the DMG actually contains.
export const WALLET_VERSION = "69.7.84";
export const MAC_APP = `Divi Desktop ${WALLET_VERSION}.app`;
// The macOS build is a Universal binary (Apple Silicon + Intel).
export const MAC_DMG = `Divi-Desktop-${WALLET_VERSION}-Universal.dmg`;
// Linux matches the Mac version.
export const LINUX_VERSION = "69.7.84";
export const LINUX_DEB = `Divi-Desktop-${LINUX_VERSION}-Linux-x86_64.deb`;
// Windows: unsigned, so Windows SmartScreen shows an "unknown publisher" warning
// the user clicks past. But as of 69.7.84 the Windows node daemon IS published,
// so it downloads, verifies, syncs and runs a node like Mac/Linux.
export const WIN_VERSION = "69.7.84";
export const WIN_EXE = `Divi-Desktop-${WIN_VERSION}-Windows-x64-setup.exe`;
