// Single source of truth for the downloadable wallet's version. The macOS app
// bundle is named "Divi Desktop <version>" (set at build time from the same
// version), so the unlock command's path and the download filenames all derive
// from here and can never drift from what the DMG actually contains.
export const WALLET_VERSION = "69.0.3";
export const MAC_APP = `Divi Desktop ${WALLET_VERSION}.app`;
export const MAC_DMG = `Divi-Desktop-${WALLET_VERSION}-AppleSilicon.dmg`;
// Linux app trails the Mac for now (still needs a rebuild for the newest flow).
export const LINUX_VERSION = "69.0.2";
export const LINUX_DEB = `Divi-Desktop-${LINUX_VERSION}-Linux-x86_64.deb`;
