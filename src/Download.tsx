import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Small download affordance, bottom-left, mirroring the version marker at the
// bottom-right. Opens a modal offering the desktop wallet per platform.
//
// Only the build that actually exists is live. The rest are shown but disabled
// rather than hidden, so a visitor sees the platforms coming without being able
// to click a link to a file that isn't there — a dead download is worse than an
// obviously pending one.

const WALLET_VERSION = "69.0.1";

interface Platform {
  id: string;
  label: string;
  detail: string;
  href?: string; // present => available
}

const PLATFORMS: Platform[] = [
  {
    id: "mac-arm",
    label: "macOS (Apple Silicon)",
    detail: "M1 / M2 / M3 and newer",
    href: "/downloads/Divi-Desktop-69.0.1-AppleSilicon.dmg",
  },
  { id: "mac-intel", label: "macOS (Intel)", detail: "Coming soon" },
  { id: "windows", label: "Windows", detail: "Coming soon" },
  { id: "linux", label: "Linux", detail: "Coming soon" },
];

export function DownloadButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className="dl-fab" onClick={() => setOpen(true)} aria-label="Download the Divi wallet">
        ↓ Wallet
      </button>

      {open &&
        createPortal(
          <div className="dl-backdrop" onClick={() => setOpen(false)} role="presentation">
            <div
              className="dl-modal panel"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Download Divi Desktop"
            >
              <div className="dl-head">
                <h3>Download Divi Desktop V{WALLET_VERSION}</h3>
                <button className="linkbtn" onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>

              <div className="dl-list">
                {PLATFORMS.map((p) =>
                  p.href ? (
                    <a key={p.id} className="dl-item dl-item-on" href={p.href} download>
                      <span className="dl-item-main">{p.label}</span>
                      <span className="dl-item-detail">{p.detail}</span>
                      <span className="dl-item-go">Download ↓</span>
                    </a>
                  ) : (
                    <div key={p.id} className="dl-item dl-item-off" aria-disabled="true">
                      <span className="dl-item-main">{p.label}</span>
                      <span className="dl-item-detail">{p.detail}</span>
                    </div>
                  ),
                )}
              </div>

              <p className="dl-note">
                {/* Say exactly what to do with it, since a .dmg is unfamiliar to
                    many people and "it downloaded, now what?" is where installs
                    stall. */}
                Double-click the downloaded file, then drag <strong>Divi Desktop</strong> into your
                Applications folder. That&apos;s it — open it from Applications like any other app.
              </p>
              <p className="dl-note muted">
                Not code-signed yet, so the first time you open it macOS may ask you to confirm:
                right-click the app and choose <strong>Open</strong>.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
