import { useEffect, useRef, useState } from "react";
import { TOKENS, TOKEN_GROUPS, type TokenDef } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { hexToHslTriplet, hslTripletToHex } from "../theme/color";
import type { Theme } from "../theme/store";

// The skin editor, ported from the Divi Desktop wallet so both products are
// styled the same way by the same tokens.
//
// Sound tokens are kept in theme/tokens.ts (so a wallet skin round-trips
// through here without losing anything) but are NOT shown — a website has no
// sound engine, and offering dead controls would be worse than hiding them.
const HIDDEN_GROUPS = new Set(["Sounds"]);

function Control({ token }: { token: TokenDef }) {
  const { theme, setToken } = useTheme();
  const value = theme[token.key] ?? token.default;

  if (token.type === "color") {
    return (
      <label className="style-row">
        <span>{token.label}</span>
        <input
          type="color"
          className="style-color"
          value={hslTripletToHex(value)}
          onChange={(e) => setToken(token.key, hexToHslTriplet(e.target.value))}
        />
      </label>
    );
  }

  if (token.type === "font" || token.type === "select") {
    return (
      <label className="style-row">
        <span>{token.label}</span>
        <select
          className="style-select"
          value={value}
          onChange={(e) => setToken(token.key, e.target.value)}
        >
          {(token.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const num = parseFloat(value) || 0;
  const shown = token.displayPercent ? `${Math.round(num * 100)}%` : `${num}${token.unit ?? ""}`;
  return (
    <label className="style-row">
      <span>
        {token.label} <em className="style-val">{shown}</em>
      </span>
      <input
        type="range"
        className="style-range"
        min={token.min}
        max={token.max}
        step={token.step}
        value={num}
        onChange={(e) => setToken(token.key, `${e.target.value}${token.unit ?? ""}`)}
      />
    </label>
  );
}

function StylePanel() {
  const { theme, reset, saved, saveCurrent, applySaved, deleteSaved, builtinSkins, applySkin, setToken } =
    useTheme();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Skins move between the wallet and here as a file: the two are separate
  // sites, so browser storage can't be shared between them.
  const exportSkin = () => {
    const blob = new Blob([JSON.stringify({ name: name.trim() || "Divi skin", tokens: theme }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(name.trim() || "divi-skin").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importSkin = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      // Accept either a bare token map or a wrapped {name, tokens} skin.
      const tokens: Theme = parsed.tokens ?? parsed;
      const known = new Set(TOKENS.map((t) => t.key));
      const applied = Object.entries(tokens).filter(([k]) => known.has(k));
      if (!applied.length) {
        setMsg("That file has no settings this page recognises.");
        return;
      }
      applied.forEach(([k, v]) => setToken(k, String(v)));
      setMsg(`Applied ${applied.length} settings.`);
    } catch {
      setMsg("That file couldn't be read as a skin.");
    }
  };

  return (
    <div className="style-panel">
      <section className="style-group">
        <h3>Skins</h3>
        <ul className="style-saved">
          {builtinSkins.map((s) => (
            <li key={s.id}>
              <button type="button" className="style-apply" onClick={() => applySkin(s.id)}>
                {s.name}
                {s.free && <span className="skin-badge">Free</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="style-save">
          <button type="button" className="style-btn" onClick={exportSkin}>
            Export skin
          </button>
          <button type="button" className="style-btn" onClick={() => fileRef.current?.click()}>
            Import skin
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importSkin(f);
              e.target.value = "";
            }}
          />
        </div>
        {msg && <p className="style-note">{msg}</p>}
        <p className="style-note">
          Skins are interchangeable with the Divi Desktop wallet — export there, import here.
        </p>
      </section>

      {TOKEN_GROUPS.filter((g) => !HIDDEN_GROUPS.has(g)).map((group) => (
        <section key={group} className="style-group">
          <h3>{group}</h3>
          {TOKENS.filter((t) => t.group === group).map((t) => (
            <Control key={t.key} token={t} />
          ))}
        </section>
      ))}

      <section className="style-group">
        <h3>My themes</h3>
        <div className="style-save">
          <input
            className="style-name"
            placeholder="Name this theme…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="style-btn style-btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              saveCurrent(name);
              setName("");
            }}
          >
            Save
          </button>
        </div>
        {saved.length > 0 && (
          <ul className="style-saved">
            {saved.map((s) => (
              <li key={s.id}>
                <button type="button" className="style-apply" onClick={() => applySaved(s.id)}>
                  {s.name}
                </button>
                <button type="button" className="style-del" aria-label="Delete" onClick={() => deleteSaved(s.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="style-btn" onClick={reset}>
          Reset to Divilicious default
        </button>
      </section>
    </div>
  );
}

/** Gear button, bottom-right, opening the skin editor in a side drawer. */
export function StyleDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        className="style-gear"
        onClick={() => setOpen((o) => !o)}
        aria-label="Appearance"
        title="Appearance"
      >
        ⚙
      </button>
      {open && (
        // Deliberately NOT dimmed: the whole point is watching the page restyle
        // live as the controls move.
        <aside className="style-drawer" role="dialog" aria-label="Appearance">
          <header className="style-drawer-head">
            <span>Appearance</span>
            <button className="style-btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          <div className="style-drawer-body">
            <StylePanel />
          </div>
        </aside>
      )}
    </>
  );
}
