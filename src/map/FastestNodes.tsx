import { useEffect, useRef, useState } from "react";
import { scanProbe } from "../api";

export interface FastCandidate {
  ip: string;
  country?: string;
  lat?: number;
  lon?: number;
}
interface Ranked extends FastCandidate {
  ms: number;
  km: number;
  /** Actual round trip divided by the physical minimum for that distance. */
  eff: number;
}

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((bLon - aLon) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Node responsiveness, ranked FAIRLY.
 *
 * Ranking by raw ping is close to meaningless on a public explorer: it only
 * says which nodes sit nearest the scanner. Measured from London it listed
 * nothing but Germany and France, and a US node answering in 86ms across
 * 8,755km never appeared, even though that is a far better result.
 *
 * So each node is scored against the physical limit for its own distance.
 * Light in fibre travels ~200,000 km/s, so the fastest a round trip can
 * possibly be is roughly distance/100 milliseconds. Dividing the real round
 * trip by that floor gives a figure independent of where the node happens to
 * be: 1.0x means it is running at the speed of light, 5x means five times
 * slower than physics requires.
 *
 * On live data the two rankings shared NOT ONE node in their top tens.
 *
 * Honest limits, stated in the panel: IP geolocation is approximate, real
 * routes are never great-circle, and this is a single sample rather than an
 * average, so treat it as indicative rather than exact.
 */
export function FastestNodes({
  nodes,
  self,
  onClose,
}: {
  nodes: FastCandidate[];
  self: { lat: number; lon: number } | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Ranked[] | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", stop, { passive: false });
    el.addEventListener("mousedown", stop);
    return () => {
      el.removeEventListener("wheel", stop);
      el.removeEventListener("mousedown", stop);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const byIp = new Map(nodes.map((n) => [n.ip, n]));
    scanProbe([...byIp.keys()])
      .then((res) => {
        if (!alive) return;
        const ranked: Ranked[] = [];
        for (const r of res) {
          if (!r.online || !r.ms) continue;
          const n = byIp.get(r.ip);
          if (!n || !self || n.lat == null || n.lon == null) continue;
          const km = haversineKm(self.lat, self.lon, n.lat, n.lon);
          // Floor the expected time so a node in the same city doesn't divide
          // by ~0 and score as absurdly bad.
          const floorMs = Math.max(1, km / 100);
          ranked.push({ ...n, ms: r.ms, km, eff: r.ms / floorMs });
        }
        ranked.sort((a, b) => a.eff - b.eff);
        setRows(ranked.slice(0, 10));
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [nodes, self]);

  return (
    <div className="fastnodes" ref={ref}>
      <div className="fn-head">
        <span className="fn-title">Best Connected</span>
        <button type="button" className="fn-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>
      <div className="fn-note">
        Speed relative to distance, so a far-off node with an excellent route beats a near one.
        <strong> 1.0x</strong> is the speed of light in fibre.
      </div>
      <div className="fn-cols">
        <span>Country</span>
        <span>Distance</span>
        <span className="fn-ms-h">vs limit</span>
      </div>
      <div className="fn-list">
        {rows === null ? (
          <div className="fn-empty">Measuring the network…</div>
        ) : rows.length === 0 ? (
          <div className="fn-empty">No nodes answered.</div>
        ) : (
          rows.map((r, i) => (
            <div key={r.ip} className="fn-row" title={`${r.ip} — ${r.ms}ms over ${Math.round(r.km).toLocaleString()}km`}>
              <span className="fn-country">
                <span className="fn-rank">{i + 1}</span>
                {r.country || "Unknown"}
              </span>
              <span className="fn-ip">
                {r.km >= 1000 ? `${Math.round(r.km / 1000)}k` : Math.round(r.km)}km
              </span>
              <span className="fn-ms">{r.eff.toFixed(1)}x</span>
            </div>
          ))
        )}
      </div>
      <div className="fn-foot">
        Locations are approximate and this is a single sample, so treat it as indicative.
      </div>
    </div>
  );
}
