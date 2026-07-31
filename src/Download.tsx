import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DownloadGuide } from "./DownloadGuide";
import { CopyCmd } from "./CopyCmd";

// Wallet download, bottom-left, mirroring the version marker on the right.
//
// Instructions are per-platform because getting an unsigned app to run differs
// completely across operating systems, and a generic note helps nobody. Only
// the build that exists is downloadable; the rest are shown disabled so a
// visitor sees them coming without being able to click through to a missing
// file.

const WALLET_VERSION = "69.0.2";
const MAC_APP = "Divi Desktop 69.01.app";

interface Step {
  title: string;
  body: React.ReactNode;
}

interface Platform {
  id: string;
  label: string;
  detail: string;
  href?: string;
  steps?: Step[];
}

const MAC_STEPS: Step[] = [
  {
    title: "1. Install",
    body: (
      <>
        Double-click the downloaded <strong>.dmg</strong>, then drag{" "}
        <strong>Divi Desktop</strong> into the <strong>Applications</strong> folder.
      </>
    ),
  },
  {
    title: "2. Unlock it (one command)",
    body: (
      <>
        Apple blocks apps whose developer hasn&apos;t paid Apple&apos;s yearly fee, so you have to
        approve it once. Open <strong>Terminal</strong> (Command + Space, type &quot;Terminal&quot;),
        then copy, paste, and press Return:
        <CopyCmd cmd={`xattr -dr com.apple.quarantine "/Applications/${MAC_APP}"`} />
        <span className="dl-alt">
          Enter your Mac password if asked (it stays hidden as you type). Nothing visible happens —
          that means it worked.
        </span>
      </>
    ),
  },
  {
    title: "3. Open it",
    body: (
      <>
        Open it from <strong>Applications</strong> — it launches normally now. When macOS asks about
        network connections, click <strong>Allow</strong> so the wallet can reach the Divi network.
      </>
    ),
  },
];

const LINUX_STEPS: Step[] = [
  {
    title: "Install",
    body: (
      <>
        Double-click the downloaded <strong>.deb</strong> file. Your software installer opens —
        click <strong>Install</strong> and enter your password. It pulls in anything else it needs
        automatically.
        <br />
        <span className="dl-alt">
          Terminal alternative:{" "}
          <code className="dl-code">sudo apt install ./Divi-Desktop-69.0.2-Linux-x86_64.deb</code>
        </span>
      </>
    ),
  },
  {
    title: "Open it",
    body: (
      <>
        Find <strong>Divi Desktop</strong> in your applications menu and open it. The first run
        downloads the Divi node software (a few MB, integrity-checked) and starts syncing the
        blockchain — this takes hours and uses about 10 GB of disk; the wallet is usable while it
        catches up.
      </>
    ),
  },
  {
    title: "Requirements",
    body: (
      <>
        A recent 64-bit distribution: <strong>Ubuntu 24.04+</strong>, <strong>Debian 13+</strong>,{" "}
        <strong>Linux Mint 22+</strong> or similar. If your firewall asks, allow Divi Desktop&apos;s
        network connections.
        <br />
        <span className="dl-alt">
          Optional, for advanced users: to accept incoming peers, forward TCP port{" "}
          <strong>51472</strong> on your router. The wallet works fully without this.
        </span>
      </>
    ),
  },
];

const PLATFORMS: Platform[] = [
  {
    id: "mac-arm",
    label: "macOS (Apple Silicon)",
    detail: "M1 / M2 / M3 and newer",
    href: "/downloads/Divi-Desktop-69.0.2-AppleSilicon.dmg",
    steps: MAC_STEPS,
  },
  {
    id: "linux",
    label: "Linux",
    detail: "Ubuntu 24.04+ / Debian 13+ / Mint 22+ (x86_64)",
    href: "/downloads/Divi-Desktop-69.0.2-Linux-x86_64.deb",
    steps: LINUX_STEPS,
  },
  { id: "mac-intel", label: "macOS (Intel)", detail: "Coming soon" },
  { id: "windows", label: "Windows", detail: "Coming soon" },
];

export function DownloadButton() {
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  // Which platform's instructions are showing. Defaults to the one available.
  const [selected, setSelected] = useState<string>("mac-arm");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const active = PLATFORMS.find((p) => p.id === selected && p.href);

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
                    <a
                      key={p.id}
                      className="dl-item dl-item-on"
                      href={p.href}
                      download
                      onClick={() => setSelected(p.id)}
                    >
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

              {active?.steps && (
                <>
                  <ol className="dl-steps">
                    {active.steps.map((s) => (
                      <li key={s.title}>
                        <span className="dl-step-title">{s.title}</span>
                        <span className="dl-step-body">{s.body}</span>
                      </li>
                    ))}
                  </ol>
                  {/* The beginner walkthrough covers the macOS security maze;
                      Linux has no equivalent hurdle, so no guide there. */}
                  {active.id === "mac-arm" && (
                    <button className="dl-moreinfo" onClick={() => setGuide(true)}>
                      More info: full step-by-step guide for beginners →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {guide && <DownloadGuide onClose={() => setGuide(false)} />}
    </>
  );
}
