import { useEffect } from "react";
import { createPortal } from "react-dom";

// The full beginner walkthrough behind "More info". Written for someone who has
// never opened Terminal, doesn't know what a firewall is, and needs to be told
// what each screen looks like. Every step is what they physically do and see,
// in order, with no assumed knowledge.

const MAC_APP = "Divi Desktop 69.01.app";

interface Section {
  heading: string;
  steps: React.ReactNode[];
}

const MAC_GUIDE: Section[] = [
  {
    heading: "1. Open the download",
    steps: [
      <>
        Find the file you just downloaded. It is in your <strong>Downloads</strong> folder, or you
        can click it in your browser&apos;s downloads list. Its name ends in <strong>.dmg</strong>.
      </>,
      <>
        Double-click that file. A small window opens showing the Divi Desktop icon next to a
        shortcut to your Applications folder.
      </>,
    ],
  },
  {
    heading: "2. Install it",
    steps: [
      <>
        In that window, drag the <strong>Divi Desktop</strong> icon on top of the{" "}
        <strong>Applications</strong> folder shown beside it. This copies the app onto your Mac.
      </>,
      <>Close the window. You can throw away the .dmg file now if you like.</>,
    ],
  },
  {
    heading: "3. Open it for the first time",
    steps: [
      <>
        Open your <strong>Applications</strong> folder and double-click <strong>Divi Desktop</strong>.
        (Or press <strong>Command + Space</strong>, type &quot;Divi&quot;, and press Return.)
      </>,
      <>
        macOS <strong>will</strong> stop it and show a message saying it cannot check the app, or
        that it is from an unidentified developer. This is normal for a brand-new app. Click{" "}
        <strong>Done</strong>. Do not click &quot;Move to Trash&quot;.
      </>,
    ],
  },
  {
    heading: "4. Allow the app (the normal way)",
    steps: [
      <>
        Open <strong>System Settings</strong>. It is the grey gear icon in your Dock, or click the
        Apple logo at the very top-left of the screen and choose System Settings.
      </>,
      <>
        In the list on the left, click <strong>Privacy &amp; Security</strong>.
      </>,
      <>
        Scroll down to the <strong>Security</strong> section. You will see a line that says{" "}
        <em>&quot;Divi Desktop was blocked to protect your Mac.&quot;</em>
      </>,
      <>
        Click the <strong>Open Anyway</strong> button next to that line.
      </>,
      <>Enter your Mac password, or use Touch ID, when it asks.</>,
      <>
        One last warning appears. Click <strong>Open</strong>. Divi Desktop starts. You only do this
        once.
      </>,
    ],
  },
  {
    heading: "5. If there is no \"Open Anyway\" button (the Terminal way)",
    steps: [
      <>
        This is a backup method that removes the block in one line. You do not need to understand
        it, just copy it exactly.
      </>,
      <>
        Press <strong>Command + Space</strong>, type <strong>Terminal</strong>, and press Return. A
        plain text window opens.
      </>,
      <>
        Click the box below once to select the whole line, then copy it with{" "}
        <strong>Command + C</strong>:
        <code className="dg-code">xattr -dr com.apple.quarantine &quot;/Applications/{MAC_APP}&quot;</code>
      </>,
      <>
        Click in the Terminal window, paste with <strong>Command + V</strong>, and press Return.
      </>,
      <>
        Nothing visible happens. That is correct. Close Terminal and open Divi Desktop normally.
      </>,
    ],
  },
  {
    heading: "6. The network pop-up",
    steps: [
      <>
        The first time Divi Desktop runs, macOS may ask:{" "}
        <em>&quot;Do you want the application Divi Desktop to accept incoming network
        connections?&quot;</em>
      </>,
      <>
        Click <strong>Allow</strong>. This lets the wallet connect to the Divi network. If you click
        Don&apos;t Allow by accident, the wallet still works, it just reaches fewer computers.
      </>,
    ],
  },
  {
    heading: "7. If you use a security app (most people don't)",
    steps: [
      <>
        Some people install an extra firewall such as <strong>Little Snitch</strong> or{" "}
        <strong>LuLu</strong>. If you have one, it will pop up asking about Divi Desktop&apos;s
        connections.
      </>,
      <>
        Choose <strong>Allow</strong> (allow all connections, forever). If you have no idea what
        these are, you do not have them, and you can ignore this step entirely.
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
