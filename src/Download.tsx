import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DownloadGuide } from "./DownloadGuide";
import { CopyCmd } from "./CopyCmd";
import { WALLET_VERSION, MAC_APP, MAC_DMG, LINUX_DEB, WIN_EXE } from "./walletVersion";

// Wallet download. The floating "↓ Wallet" button (bottom-left, mirroring the
// version marker on the right) links to the standalone /downloads page. That
// page lists each platform and shows per-platform install instructions, because
// getting an unsigned app to run differs completely across operating systems.

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
  // Shown with a red "Experimental" tag; used for the unsigned Windows test build.
  experimental?: boolean;
}

const MAC_STEPS: Step[] = [
  {
    title: "Install",
    body: (
      <>
        Double-click the downloaded <strong>.dmg</strong>, then drag{" "}
        <strong>Divi Desktop</strong> into the <strong>Applications</strong> folder.
      </>
    ),
  },
  {
    title: "Unlock it (one command)",
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
    title: "Open it",
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
          <code className="dl-code">sudo apt install ./{LINUX_DEB}</code>
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

const WINDOWS_STEPS: Step[] = [
  {
    title: "Install",
    body: (
      <>
        Double-click the downloaded <strong>-setup.exe</strong>. Because this early build
        isn&apos;t code-signed yet, Windows shows a blue <strong>SmartScreen</strong> warning —
        click <strong>More info</strong>, then <strong>Run anyway</strong>, and follow the
        installer.
      </>
    ),
  },
  {
    title: "Open it",
    body: (
      <>
        Launch <strong>Divi Desktop</strong> from the Start menu. If Windows Firewall asks,
        click <strong>Allow</strong> so the wallet can reach the Divi network.
      </>
    ),
  },
  {
    title: "Please note — experimental",
    body: (
      <>
        This is an early Windows test build. The app runs, but the built-in node isn&apos;t
        available on Windows yet, so blockchain sync won&apos;t start here. Please report
        anything that looks broken.
      </>
    ),
  },
];

// One macOS build serves both Apple Silicon and Intel (a Universal binary), so
// there is a single macOS row rather than one per chip.
const PLATFORMS: Platform[] = [
  {
    id: "windows",
    label: "Windows",
    detail: "Windows 10 / 11 (64-bit)",
    href: `/downloads/${WIN_EXE}`,
    steps: WINDOWS_STEPS,
    experimental: true,
  },
  {
    id: "mac",
    label: "macOS",
    detail: "Apple Silicon & Intel — one build for every Mac",
    href: `/downloads/${MAC_DMG}`,
    steps: MAC_STEPS,
  },
  {
    id: "linux",
    label: "Linux",
    detail: "Ubuntu 24.04+ / Debian 13+ / Mint 22+ (x86_64)",
    href: `/downloads/${LINUX_DEB}`,
    steps: LINUX_STEPS,
  },
];

// Floating button on every page; takes the visitor to the standalone /downloads page.
export function DownloadButton() {
  const nav = useNavigate();
  return (
    <button className="dl-fab" onClick={() => nav("/downloads")} aria-label="Download the Divi wallet">
      ↓ Wallet
    </button>
  );
}

// The standalone download page, rendered at /downloads (and /download). Picking a
// platform selects it (green highlight) and swaps the instructions below to that OS.
// Defaults to Windows, the build currently under test.
export function DownloadPage() {
  const [selected, setSelected] = useState<string>("windows");
  const [guide, setGuide] = useState(false);
  const active = PLATFORMS.find((p) => p.id === selected && p.href);

  return (
    <div className="dl-page">
      <div className="dl-panel panel">
        <div className="dl-head">
          <h3>Download Divi Desktop V{WALLET_VERSION}</h3>
        </div>

        <div className="dl-list">
          {PLATFORMS.map((p) =>
            p.href ? (
              <a
                key={p.id}
                className={"dl-item dl-item-on" + (p.id === selected ? " dl-item-sel" : "")}
                href={p.href}
                download
                onClick={() => setSelected(p.id)}
              >
                <span className="dl-item-main">
                  {p.label}
                  {p.experimental && <span className="dl-exp">Experimental</span>}
                </span>
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
                Linux and Windows have no equivalent, so no guide there. */}
            {active.id === "mac" && (
              <button className="dl-moreinfo" onClick={() => setGuide(true)}>
                More info: full step-by-step guide for beginners →
              </button>
            )}
          </>
        )}
      </div>

      {guide && <DownloadGuide onClose={() => setGuide(false)} />}
    </div>
  );
}
