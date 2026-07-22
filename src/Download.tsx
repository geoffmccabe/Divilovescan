import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DownloadGuide } from "./DownloadGuide";

// Wallet download, bottom-left, mirroring the version marker on the right.
//
// Instructions are per-platform because getting an unsigned app to run differs
// completely across operating systems, and a generic note helps nobody. Only
// the build that exists is downloadable; the rest are shown disabled so a
// visitor sees them coming without being able to click through to a missing
// file.

const WALLET_VERSION = "69.0.1";
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
    title: "Install",
    body: (
      <>
        Double-click the downloaded <strong>.dmg</strong>, then drag{" "}
        <strong>Divi Desktop</strong> into the Applications folder.
      </>
    ),
  },
  {
    title: "Get past the security block",
    body: (
      <>
        macOS <strong>will</strong> block the first launch, because this build is not code-signed
        yet. To allow it: open <strong>System Settings</strong>, go to{" "}
        <strong>Privacy &amp; Security</strong>, scroll to the Security section, find the line
        saying Divi Desktop was blocked, and click <strong>Open Anyway</strong>. Confirm with your
        password or Touch ID.
        <br />
        <span className="dl-alt">
          If that option is missing, open <strong>Terminal</strong> and run this, then open the app
          normally:
        </span>
        <code className="dl-code">xattr -dr com.apple.quarantine "/Applications/{MAC_APP}"</code>
      </>
    ),
  },
  {
    title: "Allow it to connect",
    body: (
      <>
        On first launch macOS asks whether to allow incoming network connections. Click{" "}
        <strong>Allow</strong>, so the wallet can reach the Divi network. If you run{" "}
        <strong>Little Snitch</strong>, <strong>LuLu</strong>, or another firewall, allow Divi
        Desktop&apos;s outgoing connections when it prompts.
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
    href: "/downloads/Divi-Desktop-69.0.1-AppleSilicon.dmg",
    steps: MAC_STEPS,
  },
  { id: "mac-intel", label: "macOS (Intel)", detail: "Coming soon" },
  { id: "windows", label: "Windows", detail: "Coming soon" },
  { id: "linux", label: "Linux", detail: "Coming soon" },
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
                  <button className="dl-moreinfo" onClick={() => setGuide(true)}>
                    More info: full step-by-step guide for beginners →
                  </button>
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
