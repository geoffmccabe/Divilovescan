import { useState } from "react";

// A one-click copy box for a Terminal command. Un-notarized apps force a
// Terminal step on the user; the least we can do is make it a single click to
// copy, with clear confirmation, so nobody has to hand-select a fiddly line.
export function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the text is still selectable by hand */
    }
  };
  return (
    <div className="copycmd">
      <code className="copycmd-text">{cmd}</code>
      <button type="button" className="copycmd-btn" onClick={copy} aria-label="Copy command">
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
