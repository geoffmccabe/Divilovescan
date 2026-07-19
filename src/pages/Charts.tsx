import { Link, useParams } from "react-router-dom";

// Charts. The cards are deliberately dumb — a title, a one-line explanation and
// a preview. Controls (date ranges and so on) belong to the full-screen view at
// /charts/:id, so a wall of nine cards doesn't become a wall of nine control
// panels.
//
// The series themselves come from the chain scan. Everything is wired now so
// that plugging the data in later is the only remaining step.

export interface ChartDef {
  id: string;
  title: string;
  blurb: string;
  /** Where the numbers will come from, so it's obvious what's still missing. */
  source: "scan" | "blocks" | "derived";
}

export const CHARTS: ChartDef[] = [
  {
    id: "transactions",
    title: "Transactions per day",
    blurb: "Real payments, with staking and block rewards excluded so it reflects actual use.",
    source: "blocks",
  },
  {
    id: "supply",
    title: "Supply growth",
    blurb: "Total DIVI in existence over time, as recorded by the chain itself.",
    source: "blocks",
  },
  {
    id: "wallets",
    title: "Wallet growth",
    blurb: "Cumulative count of addresses that have ever held DIVI.",
    source: "scan",
  },
  {
    id: "new-wallets",
    title: "New wallets per day",
    blurb: "Addresses appearing on the chain for the first time.",
    source: "scan",
  },
  {
    id: "block-time",
    title: "Block time",
    blurb: "Average seconds between blocks — how steadily the chain is moving.",
    source: "blocks",
  },
  {
    id: "difficulty",
    title: "Difficulty",
    blurb: "How hard it is to win a block, which tracks how much stake is competing.",
    source: "blocks",
  },
  {
    id: "staking",
    title: "Staking participation",
    blurb: "How much of the supply is actively staking rather than sitting idle.",
    source: "derived",
  },
  {
    id: "vaulted",
    title: "Vaulted vs self-custodied",
    blurb:
      "How much DIVI is staked through a delegate rather than directly. Unique to Divi — no other explorer shows this.",
    source: "scan",
  },
];

export const chartById = (id: string) => CHARTS.find((c) => c.id === id) ?? null;

/** Placeholder preview until the scan lands; deliberately not fake data. */
function Pending({ tall }: { tall?: boolean }) {
  return (
    <div className={"chart-pending" + (tall ? " chart-pending-tall" : "")}>
      <span>Awaiting chain scan</span>
    </div>
  );
}

export function ChartsPage() {
  return (
    <section className="panel">
      <h2 className="section-title">Charts</h2>
      <p className="wl-note">
        Click any chart to open it full screen, where date ranges and other controls live.
      </p>
      <div className="chart-grid">
        {CHARTS.map((c) => (
          <Link key={c.id} to={`/charts/${c.id}`} className="chart-card">
            <div className="chart-card-title">{c.title}</div>
            <Pending />
            <div className="chart-card-blurb">{c.blurb}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ChartFullPage() {
  const { id = "" } = useParams();
  const chart = chartById(id);

  if (!chart) {
    return (
      <section className="panel">
        <p className="err">No chart by that name.</p>
        <Link to="/charts">← All charts</Link>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="list-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          {chart.title}
        </h2>
        <div className="list-controls">
          {/* Range controls belong here rather than on the cards. Disabled until
              there is a series to range over — an enabled control that does
              nothing is worse than an obviously inactive one. */}
          <label className="sizer">
            Range
            <select disabled defaultValue="all">
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1y">1 year</option>
              <option value="all">All time</option>
            </select>
          </label>
          <Link to="/charts" className="linkbtn">
            ← All charts
          </Link>
        </div>
      </div>
      <p className="wl-note">{chart.blurb}</p>
      <Pending tall />
    </section>
  );
}
