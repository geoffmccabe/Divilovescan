import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { scanSeries, type DayRow, type Series } from "../api";
import { Chart, type Point } from "../Chart";

// Charts. Cards are deliberately dumb — title, one-line explanation, preview.
// Controls live on the full-screen view at /charts/:id, so eight cards don't
// become eight control panels.

type Pick = (d: DayRow) => number | null;

export interface ChartDef {
  id: string;
  title: string;
  blurb: string;
  pick: Pick;
  /** Running total rather than a per-day figure. */
  cumulative?: boolean;
  /**
   * Trim leading zeroes. Only for series where zero cannot be a real reading —
   * supply and difficulty are never genuinely zero, so a leading zero there is
   * "not recorded yet" and anchors the chart to the bottom. For counts, zero IS
   * a real measurement (no payments that day) and must be kept.
   */
  trimZeroStart?: boolean;
  fmt?: (n: number) => string;
  color?: string;
}

const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` :
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` :
  n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` :
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export const CHARTS: ChartDef[] = [
  {
    id: "transactions",
    title: "Payments per day",
    blurb: "Real payments, with staking and block rewards excluded so it reflects actual use.",
    pick: (d) => d.pay,
    fmt: compact,
  },
  {
    id: "supply",
    title: "Supply growth",
    blurb: "Total DIVI in existence over time, as recorded by the chain itself.",
    pick: (d) => (d.supply == null ? null : d.supply / 1e8),
    fmt: compact,
    trimZeroStart: true,
    color: "hsl(var(--success))",
  },
  {
    id: "wallets",
    title: "Wallet growth",
    blurb: "Cumulative count of addresses that have ever held DIVI.",
    pick: (d) => d.neww,
    cumulative: true,
    fmt: compact,
    color: "hsl(var(--accent))",
  },
  {
    id: "new-wallets",
    title: "New wallets per day",
    blurb: "Addresses appearing on the chain for the first time.",
    pick: (d) => d.neww,
    fmt: compact,
    color: "hsl(var(--accent))",
  },
  {
    id: "block-time",
    title: "Block time",
    blurb: "Average seconds between blocks — how steadily the chain is moving.",
    // 86,400 seconds in a day divided by the blocks found in it.
    pick: (d) => (d.blocks ? 86400 / d.blocks : null),
    fmt: (n) => `${n.toFixed(0)}s`,
    color: "hsl(var(--warning))",
  },
  {
    id: "stake-winners",
    title: "Stake winners per day",
    blurb:
      "How many different wallets won at least one block that day. Vaulted wins count for the owner, not the delegate who staked for them.",
    pick: (d) => d.win,
    fmt: compact,
    color: "hsl(var(--warning))",
  },
  {
    id: "difficulty",
    title: "Difficulty",
    blurb: "How hard it is to win a block, which tracks how much stake is competing.",
    pick: (d) => d.diff,
    fmt: compact,
    trimZeroStart: true,
    color: "hsl(var(--info))",
  },
  {
    id: "blocks",
    title: "Blocks per day",
    blurb: "How many blocks the network produced each day.",
    pick: (d) => d.blocks,
    fmt: compact,
  },
  {
    id: "all-transactions",
    title: "All transactions per day",
    blurb: "Every transaction including the coinbase and coinstake each block carries.",
    pick: (d) => d.txs,
    fmt: compact,
  },
];

export const chartById = (id: string) => CHARTS.find((c) => c.id === id) ?? null;

const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "all", label: "All time", days: null },
];

/**
 * Drops the days that would lie.
 *
 * The LAST day is today and still in progress, so its totals are a fraction of
 * a real day — plotted raw it looks like a collapse. The FIRST day is the
 * chain's launch day, equally partial: it carries a single block, which made
 * "block time" read 86,400 seconds and flattened that chart entirely.
 *
 * Both are excluded everywhere rather than special-cased per chart, because a
 * partial day is misleading in every series it appears in.
 */
function completeDays(days: DayRow[]): DayRow[] {
  return days.length > 2 ? days.slice(1, -1) : [];
}

function toPoints(days: DayRow[], def: ChartDef): Point[] {
  const out: Point[] = [];
  let run = 0;
  for (const d of completeDays(days)) {
    const v = def.pick(d);
    if (def.cumulative) {
      run += v ?? 0;
      out.push({ x: d.d, y: run });
    } else if (v != null) {
      out.push({ x: d.d, y: v });
    }
  }
  if (def.trimZeroStart) {
    let i = 0;
    while (i < out.length - 1 && out[i].y === 0) i++;
    return out.slice(i);
  }
  return out;
}

/** Shared fetch — eight cards must not each pull the whole series. */
function useSeries() {
  const [series, setSeries] = useState<Series | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    scanSeries()
      .then((s) => alive && setSeries(s))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);
  return { series, err };
}

export function ChartsPage() {
  const { series, err } = useSeries();

  return (
    <section className="panel">
      <h2 className="section-title">Charts</h2>
      <p className="wl-note">
        Click any chart to open it full screen, where date ranges live. Built from a full scan of
        the chain{series ? `, ${completeDays(series.days).length.toLocaleString()} complete days since ${completeDays(series.days)[0]?.d}` : ""}.
        Today is excluded until it finishes, so no chart ends on a part-day.
      </p>

      {err && <p className="err">{err}</p>}

      <div className="chart-grid">
        {CHARTS.map((c) => (
          <Link key={c.id} to={`/charts/${c.id}`} className="chart-card">
            <div className="chart-card-title">{c.title}</div>
            {series ? (
              <Chart points={toPoints(series.days, c)} mini fmt={c.fmt} color={c.color} />
            ) : (
              <div className="chart-pending">
                <span>Loading…</span>
              </div>
            )}
            <div className="chart-card-blurb">{c.blurb}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ChartFullPage() {
  const { id = "" } = useParams();
  const def = chartById(id);
  const { series, err } = useSeries();
  const [range, setRange] = useState("all");

  if (!def) {
    return (
      <section className="panel">
        <p className="err">No chart by that name.</p>
        <Link to="/charts">← All charts</Link>
      </section>
    );
  }

  const days = series?.days ?? [];
  const window = RANGES.find((r) => r.id === range)?.days ?? null;
  // Cumulative series are sliced AFTER accumulating, so a 30-day view still
  // shows the true running total rather than restarting from zero.
  const all = toPoints(days, def);
  const points = window ? all.slice(-window) : all;

  const latest = points.length ? points[points.length - 1].y : null;

  return (
    <section className="panel">
      <div className="list-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          {def.title}
        </h2>
        <div className="list-controls">
          <label className="sizer">
            Range
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <Link to="/charts" className="linkbtn">
            ← All charts
          </Link>
        </div>
      </div>

      <p className="wl-note">{def.blurb}</p>
      {err && <p className="err">{err}</p>}

      {latest != null && (
        <div className="ch-stats" style={{ marginBottom: 6 }}>
          <div className="ch-stat">
            <div className="ch-stat-value">{(def.fmt ?? compact)(latest)}</div>
            <div className="ch-stat-label">Latest</div>
          </div>
          <div className="ch-stat">
            <div className="ch-stat-value">{points.length.toLocaleString()}</div>
            <div className="ch-stat-label">Days shown</div>
          </div>
        </div>
      )}

      {series ? (
        <Chart points={points} height={340} fmt={def.fmt} color={def.color} />
      ) : (
        <div className="chart-pending chart-pending-tall">
          <span>Loading…</span>
        </div>
      )}
    </section>
  );
}
