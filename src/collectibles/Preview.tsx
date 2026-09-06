import { useState } from "react";
import { previewUrl } from "../overlay";

// A collectible's preview image, and the caveat that has to travel with it.
//
// The artwork itself is encrypted and only the owner can open it. What a
// creator may publish alongside is a preview, and the spec is blunt about what
// that is worth: `thumb_ptr` is an independent object, and nothing on-chain
// binds it to the encrypted content. A creator can show one thing and encrypt
// another. So the preview is the creator's CLAIM, never proof.
//
// This component therefore never presents a picture as "the collectible". It is
// labelled, and the label is not optional, because a marketplace or an explorer
// that implies otherwise is where someone gets defrauded.

export type PreviewSize = "thumb" | "tile" | "full";

const BOX: Record<PreviewSize, number> = { thumb: 32, tile: 132, full: 320 };

export function Preview({
  thumbPtr,
  size = "tile",
  alt,
}: {
  thumbPtr: string | null;
  size?: PreviewSize;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = previewUrl(thumbPtr);
  const px = BOX[size];

  // No preview published is a normal, deliberate state, not a failure: an
  // encrypted-only collectible is the default the spec describes. Say that
  // rather than showing a broken frame.
  if (!url || failed) {
    return (
      <span
        className="nfd-preview nfd-preview-none"
        style={{ width: px, height: px }}
        title={
          failed
            ? "This preview could not be loaded, or has been removed."
            : "The creator published no preview. The artwork is encrypted."
        }
        aria-label={failed ? "Preview unavailable" : "No preview published"}
      >
        <span aria-hidden="true">{failed ? "!" : "▧"}</span>
      </span>
    );
  }

  return (
    <img
      className="nfd-preview"
      src={url}
      alt={alt}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      // A grid of these can be twenty images; none of them should block paint.
      onError={() => setFailed(true)}
      style={{ width: px, height: px }}
    />
  );
}

/// The sentence that must appear wherever a preview is shown at any size worth
/// looking at. Kept in one place so it cannot drift into something softer.
export function PreviewCaveat() {
  return (
    <p className="wl-note nfd-caveat">
      This preview is what the creator chose to publish. The collectible itself is encrypted and
      only its owner can open it, and nothing on the chain ties the preview to the encrypted
      content, so treat it as the creator&apos;s claim rather than proof of what you would get.
    </p>
  );
}
