import { useState } from "react";
import { parseRawTx, trailing, type Span } from "./rawtx";

// The Transaction Inspector: the raw transaction rendered byte-for-byte, with
// every field hoverable and explained. The point is teaching — someone who has
// never seen a transaction's bytes should be able to hover along it and come
// away understanding what a UTXO chain actually is.

export function TxInspector({ rawHex }: { rawHex: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  let spans: Span[] = [];
  let leftover = "";
  let parseError: string | null = null;
  try {
    spans = parseRawTx(rawHex);
    leftover = trailing(rawHex, spans);
  } catch {
    parseError = "This transaction couldn't be broken down field by field.";
  }

  if (parseError) {
    return <p className="muted">{parseError}</p>;
  }

  const shown = active != null ? spans[active] : null;

  return (
    <div className="insp">
      <p className="insp-hint muted">
        Hover any part of the transaction below to see what those bytes mean.
      </p>

      <div
        className="insp-hex"
        onMouseLeave={() => setActive(null)}
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      >
        {spans.map((s, i) => (
          <span
            key={i}
            className={
              "insp-span" + (active === i ? " insp-active" : "") + (i % 2 ? " insp-alt" : "")
            }
            onMouseEnter={() => setActive(i)}
            // Keyboard users get the same explanations.
            tabIndex={0}
            onFocus={() => setActive(i)}
            aria-label={`${s.label}: ${s.value}`}
          >
            {s.hex}
          </span>
        ))}
        {leftover && <span className="insp-span insp-unknown">{leftover}</span>}
      </div>

      {shown && (
        <div
          className="insp-modal panel"
          style={{
            // Anchored near the cursor but clamped so it can never sit off-screen.
            left: Math.min(Math.max(pos.x - 150, 12), Math.max(12, window.innerWidth - 372)),
            top: Math.min(pos.y + 22, window.innerHeight - 240),
          }}
          role="tooltip"
        >
          <div className="insp-modal-hex">
            0x{shown.hex.length > 40 ? `${shown.hex.slice(0, 40)}…` : shown.hex}
          </div>
          <div className="insp-modal-title">
            {shown.label} <span className="muted">· {shown.group}</span>
          </div>
          <div className="insp-modal-value">{shown.value}</div>
          <p className="insp-modal-text">{shown.explain}</p>
          {shown.diviNote && (
            <p className="insp-modal-divi">
              <strong>Divi:</strong> {shown.diviNote}
            </p>
          )}
        </div>
      )}

      {leftover && (
        <p className="err insp-hint">
          {leftover.length / 2} byte(s) at the end weren't recognised — please report this, it
          means Divi's format differs from what this tool expects.
        </p>
      )}
    </div>
  );
}
