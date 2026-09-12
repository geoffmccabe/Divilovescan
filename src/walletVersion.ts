// Single source of truth for the downloadable wallet's version. Download
// filenames derive from the version. The macOS APP BUNDLE, however, is named
// from the app's (versionless) productName — "Divi Desktop 69" — NOT the
// version, so MAC_APP must be that literal or the unlock command points at a
// path that doesn't exist. (This drifted once: MAC_APP was version-derived while
// productName was made versionless, so the pasted xattr command failed.)
export const WALLET_VERSION = "69.10.0";
export const MAC_APP = `Divi Desktop 69.app`;
// The macOS build is a Universal binary (Apple Silicon + Intel).
export const MAC_DMG = `Divi-Desktop-${WALLET_VERSION}-Universal.dmg`;
// Linux matches the Mac version.
export const LINUX_VERSION = "69.10.0";
export const LINUX_DEB = `Divi-Desktop-${LINUX_VERSION}-Linux-x86_64.deb`;
// Windows: unsigned, so Windows SmartScreen shows an "unknown publisher" warning
// the user clicks past. The Windows node daemon IS published, so it downloads,
// verifies, syncs and runs a node like Mac/Linux.
export const WIN_VERSION = "69.10.0";
export const WIN_EXE = `Divi-Desktop-${WIN_VERSION}-Windows-x64-setup.exe`;
