import { useState } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { BlockPage } from "./pages/Block";
import { TxPage } from "./pages/Tx";
import { AddressPage } from "./pages/Address";
import { APP_VERSION } from "./version";

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
        <Link to="/" className="hdr-brand">
          divi<span>love</span>scan
        </Link>
        <form className="search" onSubmit={submit}>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setBad(false);
            }}
            placeholder="Search block height, hash, transaction or address"
            aria-label="Search the Divi blockchain"
            aria-invalid={bad}
          />
          <button type="submit">Search</button>
        </form>
      </header>

      {bad && (
        <p className="err" role="alert">
          That doesn't look like a block height, hash, transaction id or Divi address.
        </p>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/block/:id" element={<BlockPage />} />
        <Route path="/tx/:txid" element={<TxPage />} />
        <Route path="/address/:address" element={<AddressPage />} />
      </Routes>

      <div className="version">{APP_VERSION}</div>
    </div>
  );
}
