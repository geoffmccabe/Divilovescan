import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CopyCmd } from "./CopyCmd";
import { MAC_APP } from "./walletVersion";

// The full beginner walkthrough behind "More info". Written for someone who has
// never opened Terminal. Ordering matters: it LEADS with the one command that
// reliably works on current macOS, because the System-Settings "Open Anyway"
// button is missing or ineffective on recent versions — real user feedback was
// "none of the guides worked other than the xattr command."

const UNLOCK = `xattr -dr com.apple.quarantine "/Applications/${MAC_APP}"`;

interface Section {
  heading: string;
  steps: React.ReactNode[];
}

const MAC_GUIDE: Section[] = [
  {
    heading: "Why this extra step exists",
    steps: [
      <>
        Apple only lets apps open without a warning if the developer pays Apple a yearly fee and
        registers with them. Divi Desktop hasn&apos;t done that yet, so macOS blocks it the first
        time. The app is safe; you just have to tell your Mac to trust it once. It takes about a
        minute.
      </>,
    ],
  },
  {
    heading: "1. Install it",
    steps: [
      <>
        Double-click the downloaded <strong>.dmg</strong> file (it&apos;s in your{" "}
        <strong>Downloads</strong> folder). A window opens with the Divi Desktop icon and your
        Applications folder.
      </>,
      <>
        Drag the <strong>Divi Desktop</strong> icon onto the <strong>Applications</strong> folder
        beside it. Then close the window. This is important — the next step expects the app to be in
        Applications.
      </>,
    ],
  },
  {
    heading: "2. Unlock it (the one step that always works)",
    steps: [
      <>
        Press <strong>Command + Space</strong>, type <strong>Terminal</strong>, and press Return. A
        plain text window opens. Don&apos;t worry — you&apos;ll paste one line and be done.
      </>,
      <>
        Click <strong>Copy</strong> below, click into the Terminal window, paste with{" "}
        <strong>Command + V</strong>, and press Return:
        <CopyCmd cmd={UNLOCK} />
      </>,
      <>
        If it asks for your password, type it (the screen won&apos;t show anything as you type — that
        is normal) and press Return. Nothing visible happens afterward. That means it worked.
      </>,
      <>Close Terminal.</>,
    ],
  },
  {
    heading: "3. Open Divi Desktop",
    steps: [
      <>
        Open your <strong>Applications</strong> folder and double-click <strong>Divi Desktop</strong>
        . It now opens normally, with no warning. You only did the unlock step once — you won&apos;t
        need it again.
      </>,
      <>
        The first time it runs, macOS may ask whether to allow incoming network connections. Click{" "}
        <strong>Allow</strong> so the wallet can reach the Divi network.
      </>,
    ],
  },
  {
    heading: "Didn't want to use Terminal? (alternative)",
    steps: [
      <>
        On some older Macs you can skip Terminal: double-click the app, click <strong>Done</strong> on
        the warning, then open <strong>System Settings → Privacy &amp; Security</strong>, scroll to the
        Security section, and click <strong>Open Anyway</strong> next to the Divi Desktop line.
      </>,
      <>
        On recent macOS that button is often missing — if you don&apos;t see it, use the one-line
        unlock command above instead. It does the same thing, more reliably.
      </>,
    ],
  },
  {
    heading: "If you use a security app (most people don't)",
    steps: [
      <>
        Some people install an extra firewall such as <strong>Little Snitch</strong> or{" "}
        <strong>LuLu</strong>. If one pops up asking about Divi Desktop, choose <strong>Allow</strong>.
        If you have no idea what these are, you don&apos;t have them — ignore this.
      </>,
    ],
  },
];

export function DownloadGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="dl-backdrop" onClick={onClose} role="presentation">
      <div
        className="dg-modal panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Step by step install guide"
      >
        <div className="dl-head">
          <h3>Installing on macOS, step by step</h3>
          <button className="linkbtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="dg-body">
          {MAC_GUIDE.map((sec) => (
            <section key={sec.heading} className="dg-section">
              <h4>{sec.heading}</h4>
              <ol>
                {sec.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
