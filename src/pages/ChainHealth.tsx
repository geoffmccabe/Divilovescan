import { useEffect, useState } from "react";
import { getChainTips, type ChainTip } from "../api";
import { ForkTree, type SeenFork } from "../ForkTree";

// Chain Health — the same reading the Divi Desktop wallet gives, in a larger
// panel. It reports on forks: short-lived competing blocks are normal on any
// chain, but a sustained rise, or a long branch, is worth noticing.
//
// The underlying call walks the node's whole fork set and stalls block
// processing for ~18 seconds, so it is answered from a server-side cache that
// refreshes at most every 10 minutes. Nothing here polls.

const VERDICT_TINT: Record<string, string> = {
  unknown: "hsl(var(--muted-foreground))",
  normal: "hsl(var(--success))",
  elevated: "hsl(var(--warning))",
  watch: "hsl(var(--warning))",
  serious: "hsl(var(--destructive))",
};

function verdictFor(orphans: number, longest: number): { key: string; text: string } {
  if (longest >= 6) {
    return {
      key: "serious",
      text:
        "A competing branch reached six blocks or more. On a healthy chain that is rare — worth " +
        "watching closely.",
    };
  }
  if (longest >= 3 || orphans > 40) {
    return {
      key: "watch",
      text: "More forking than usual. Not alarming on its own, but worth keeping an eye on.",
    };
  }
  if (orphans > 15) {
    return { key: "elevated", text: "Slightly more short forks than typical. Normal variation." };
  }
  return {
    key: "normal",
    text:
      "Normal. Short competing blocks happen constantly on any chain — two stakers finding a " +
      "block at nearly the same moment. One wins, the other is discarded.",
  };
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="ch-stat">
      <div className="ch-stat-value" style={tint ? { color: tint } : undefined}>
        {value}
      </div>
      <div className="ch-stat-label">{label}</div>
    </div>
  );
}

export function ChainHealthPage() {
  const [tips, setTips] = useState<ChainTip[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getChainTips()
      .then((t) => alive && setTips(t))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  if (err) return <p className="panel err">{err}</p>;
  if (!tips) {
    return (
      <p className="panel muted">
        Reading the chain's fork history… this can take a moment — the node has to walk its whole
        fork set.
      </p>
    );
  }

  const active = tips.find((t) => t.status === "active");
  const forks = tips.filter((t) => t.status !== "active");
  const longest = forks.reduce((m, f) => Math.max(m, f.branchlen || 0), 0);
  const v = verdictFor(forks.length, longest);
  // getchaintips carries no timestamps, so unlike the wallet (which accumulates
  // its own history) this is a point-in-time snapshot of what the node knows.
  const seen: SeenFork[] = forks.map((f) => ({
    height: f.height,
    status: f.status,
    branchLen: f.branchlen || 0,
  }));

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Chain Health</h2>
        <div className="ch-stats">
          <Stat label="Chain height" value={active ? active.height.toLocaleString() : "—"} />
          <Stat label="Known forks" value={forks.length.toLocaleString()} />
          <Stat
            label="Longest branch"
            value={longest ? `${longest} blocks` : "none"}
            tint={longest >= 3 ? VERDICT_TINT.watch : undefined}
          />
          <Stat label="Verdict" value={v.key.toUpperCase()} tint={VERDICT_TINT[v.key]} />
        </div>
        <p className="wl-note ch-verdict" style={{ color: VERDICT_TINT[v.key] }}>
          {v.text}
        </p>
        <p className="muted ch-note">
          Refreshed at most every 10 minutes. Asking the node for this stalls its block processing
          for around 18 seconds, so it is deliberately not live.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Fork tree</h2>
        <p className="wl-note">
          The chain as one line left to right, with each stale block hanging below the block that
          beat it. Long uneventful stretches collapse into a dashed connector labelled with how
          many blocks were skipped, so forks far apart still sit side by side.
        </p>
        <ForkTree forks={seen} tip={active ? active.height : 0} />
      </section>

      <section className="panel">
        <h2 className="section-title">Branches ({forks.length})</h2>
        {forks.length === 0 ? (
          <p className="muted">No competing branches known — the node sees a single clean chain.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Height</th>
                  <th>Branch length</th>
                  <th>Status</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {forks
                  .slice()
                  .sort((a, b) => b.height - a.height)
                  .slice(0, 200)
                  .map((f) => (
                    <tr key={f.hash}>
                      <td className="mono">{f.height.toLocaleString()}</td>
                      <td>{f.branchlen}</td>
                      <td className="muted">{f.status}</td>
                      <td className="mono">
                        {f.hash.slice(0, 14)}…{f.hash.slice(-8)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
