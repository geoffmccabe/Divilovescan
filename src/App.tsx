import { useState } from "react";
import { Routes, Route, Link, NavLink, useNavigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { BlockPage } from "./pages/Block";
import { TxPage } from "./pages/Tx";
import { AddressPage } from "./pages/Address";
import { RichListPage } from "./pages/RichList";
import { ChainHealthPage } from "./pages/ChainHealth";
import { ChartsPage, ChartFullPage } from "./pages/Charts";
import { NetworkPage } from "./pages/Network";
import { StatsPage } from "./pages/Stats";
import { NfdDetail } from "./collectibles/NfdDetail";
import { DmtDetail } from "./collectibles/DmtDetail";
import { StyleDrawer } from "./admin/StyleDrawer";
import { DownloadButton } from "./Download";
import { APP_VERSION } from "./version";
import heart from "./assets/heart.webp";

// Analysis sections. Each gets its own URL so they're linkable and survive a
// refresh, rather than being hidden UI state.
const TABS = [
  { to: "/richlist", label: "Rich List" },
  { to: "/chain-health", label: "Chain Health" },
  { to: "/charts", label: "Charts" },
  { to: "/network", label: "Network Map" },
  { to: "/stats", label: "Stats" },
];

/**
 * Works out what the user pasted and sends them to the right page. Divi
 * addresses start with 'D'; block hashes and transaction ids are both 64 hex
 * characters, so those are disambiguated on the block page itself (it falls
 * back to treating the hash as a transaction).
 */
function routeForQuery(q: string): string | null {
  const s = q.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return `/block/${s}`;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return `/block/${s.toLowerCase()}`;
  // Token ticker: 3-8 chars, starts with a letter, protocol character set.
  if (/^[A-Za-z][A-Za-z0-9!#^\-_+.]{2,7}$/.test(s) && !/^\d+$/.test(s)) {
    return `/dmt/${s.toUpperCase()}`;
  }
  if (/^[A-Za-z0-9]{26,48}$/.test(s)) return `/address/${s}`;
  return null;
}

export function App() {
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);
  const nav = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const to = routeForQuery(q);
    if (!to) {
      setBad(true);
      return;
    }
    setBad(false);
    setQ("");
    nav(to);
  };

  return (
    <div className="shell">
      <header className="hdr">
        <Link to="/" className="hdr-brand logo" aria-label="Divi Love Scan">
          {/* Sits behind the words, never on top of them. */}
          <span className="logo-glow" aria-hidden />
          <span className="logo-word logo-divi">divi</span>
          <span className="logo-mid">
            <span className="logo-love">love</span>
            <img className="logo-heart" src={heart} alt="" aria-hidden />
          </span>
          <span className="logo-word logo-scan">scan</span>
        </Link>
        <form className="search" onSubmit={submit}>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setBad(false);
            }}
            placeholder="Search block, transaction, address or token ticker"
            aria-label="Search the Divi blockchain"
            aria-invalid={bad}
          />
          <button type="submit">Search</button>
        </form>
      </header>

      {bad && (
        <p className="err" role="alert">
          That doesn't look like a block height, hash, transaction id, Divi address or token ticker.
        </p>
      )}

      <nav className="tabs" role="navigation" aria-label="Analysis">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => "tab" + (isActive ? " tab-on" : "")}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/richlist" element={<RichListPage />} />
        <Route path="/chain-health" element={<ChainHealthPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/charts/:id" element={<ChartFullPage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/block/:id" element={<BlockPage />} />
        <Route path="/tx/:txid" element={<TxPage />} />
        <Route path="/address/:address" element={<AddressPage />} />
        <Route path="/nfd/:id" element={<NfdDetail />} />
        <Route path="/dmt/:id" element={<DmtDetail />} />
      </Routes>

      <StyleDrawer />
      <DownloadButton />
      <div className="version">{APP_VERSION}</div>
    </div>
  );
}
