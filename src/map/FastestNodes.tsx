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
  km: number | null;
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
 * Round-trip time from THIS node to each peer. Presented as a plain fact about
 * the scanner's own connections, with no claim about node quality.
 *
 * Two rankings were tried here and both were withdrawn as unsound:
 *
 *  1. Raw ping "fastest nodes" only measured proximity to the scanner. From
 *     London it listed nothing but Germany and France, by construction.
 *  2. Normalising that by great-circle distance looked fairer but rests on an
 *     assumption that is false: fibre does not run in straight lines. A Denver
 *     node may route via Chicago and New York before crossing the Atlantic, so
 *     a "1.0x the speed of light" score can just as easily mean the IP
 *     geolocated near a cable landing as that the node is any good.
 *
 * Sync freshness was checked as a third option and does not discriminate:
 * 39 of 43 peers sit exactly at the chain tip and the rest are 1-2 blocks back.
 *
 * Genuinely ranking node speed needs each node to measure and report its own
 * latency to its peers, which the protocol has no way to carry today. That is a
 * node-software feature, not something an explorer can infer.
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
  // How many were asked vs how many answered: with the full 30-day set, a good
  // number are simply offline now, and that is worth stating rather than
  // quietly showing a short list.
  const [asked, setAsked] = useState(0);

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
    setAsked(byIp.size);
    scanProbe([...byIp.keys()])
      .then((res) => {
        if (!alive) return;
        const ranked: Ranked[] = [];
        for (const r of res) {
          if (!r.online || !r.ms) continue;
          const n = byIp.get(r.ip);
          if (!n) continue;
          // Distance is shown for context only. A node with no location still
          // belongs in the ranking, so it is optional rather than a filter.
          const km =
            self && n.lat != null && n.lon != null
              ? haversineKm(self.lat, self.lon, n.lat, n.lon)
              : null;
          ranked.push({ ...n, ms: r.ms, km });
        }
        ranked.sort((a, b) => a.ms - b.ms);
        setRows(ranked);
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [nodes, self]);

  return (
    <div className="fastnodes" ref={ref}>
      <div className="fn-head">
        <span className="fn-title">Node Speed</span>
        <button type="button" className="fn-close" onClick={onClose} title="Close">
          ×
        </button>
      </div>
      <div className="fn-note">
        Every known node, pinged from the scanner and ordered by response. This favours nodes
        near the scanner, so it is <strong>not</strong> a fair contest between nodes.
      </div>
      <div className="fn-cols">
        <span>Country</span>
        <span>Distance</span>
        <span className="fn-ms-h">ms</span>
      </div>
      <div className="fn-list">
        {rows === null ? (
          <div className="fn-empty">Pinging {asked} nodes…</div>
        ) : rows.length === 0 ? (
          <div className="fn-empty">No nodes answered.</div>
        ) : (
          rows.map((r, i) => (
            <div key={r.ip} className="fn-row" title={r.km == null ? `${r.ip} — ${r.ms}ms` : `${r.ip} — ${r.ms}ms over ${Math.round(r.km).toLocaleString()}km`}>
              <span className="fn-country">
                <span className="fn-rank">{i + 1}</span>
                {r.country || "Unknown"}
              </span>
              <span className="fn-ip">
                {/* Full precision: rounding to the nearest 1,000 km collapsed
                    five different US cities into an identical "6k". */}
                {r.km == null ? "—" : `${Math.round(r.km).toLocaleString()} km`}
              </span>
              <span className="fn-ms">{r.ms}</span>
            </div>
          ))
        )}
      </div>
      <div className="fn-foot">
        {rows === null
          ? "Measuring every node the map knows."
          : `${rows.length} of ${asked} answered. The rest are offline or not accepting connections.`}
      </div>
    </div>
  );
}
