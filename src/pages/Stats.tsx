import { useEffect, useState } from "react";
import {
  getBlockHash,
  getBlockRaw,
  getChainInfo,
  getNodeInfo,
  getPeerInfo,
  scanSummary,
  type ScanSummary,
  LOTTERY_CYCLE,
  TREASURY_CYCLE,
  type ChainInfo,
  type NodeInfo,
  type PeerInfo,
} from "../api";
import { fmtDivi, fmtTime } from "../format";

// Stats. Chain-wide facts first, since those are true for everyone; the panel
// at the bottom is only what THIS node sees, which is a different kind of claim
// and is labelled as such.

const SAMPLE = 50; // blocks used to measure recent block spacing

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value}
        {note && <span className="muted stat-note"> {note}</span>}
      </dd>
    </>
  );
}

export function StatsPage() {
  const [chain, setChain] = useState<ChainInfo | null>(null);
  const [supply, setSupply] = useState<number | null>(null);
  const [tipTime, setTipTime] = useState<number | null>(null);
  const [spacing, setSpacing] = useState<number | null>(null);
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [peers, setPeers] = useState<PeerInfo[] | null>(null);
  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await getChainInfo();
        if (!alive) return;
        setChain(info);

        // Supply and tip time come from the tip block's own header.
        const tip = await getBlockRaw(await getBlockHash(info.blocks));
        if (!alive) return;
        if (typeof tip?.moneysupply === "number") setSupply(tip.moneysupply);
        if (typeof tip?.time === "number") setTipTime(tip.time);

        // Average spacing measured over recent blocks rather than assumed.
        const older = await getBlockRaw(await getBlockHash(info.blocks - SAMPLE));
        if (alive && tip?.time && older?.time) {
          setSpacing((tip.time - older.time) / SAMPLE);
        }
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    })();

    scanSummary().then((s) => alive && setScan(s)).catch(() => {});
    getNodeInfo().then((n) => alive && setNode(n)).catch(() => {});
    getPeerInfo().then((p) => alive && setPeers(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (err && !chain) return <p className="panel err">{err}</p>;

  const h = chain?.blocks ?? 0;
  const nextLottery = h ? Math.ceil((h + 1) / LOTTERY_CYCLE) * LOTTERY_CYCLE : 0;
  const nextTreasury = h ? Math.ceil((h + 1) / TREASURY_CYCLE) * TREASURY_CYCLE : 0;
  const blocksToLottery = nextLottery - h;
  const eta = (blocks: number) =>
    spacing ? `~${((blocks * spacing) / 3600).toFixed(1)} hours away` : "";

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Divi — chain-wide</h2>
        <dl className="kv stats-kv">
          <Row label="Block height" value={h ? h.toLocaleString() : "—"} />
          <Row
            label="Coin supply"
            value={supply != null ? `${fmtDivi(supply)} DIVI` : "—"}
            note="as recorded in the latest block"
          />
          <Row
            label="Difficulty"
            value={chain ? chain.difficulty.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
          />
          <Row
            label="Average block time"
            value={spacing ? `${spacing.toFixed(1)} seconds` : "—"}
            note={`measured over the last ${SAMPLE} blocks`}
          />
          <Row label="Latest block" value={tipTime ? fmtTime(tipTime) : "—"} />
          <Row
            label="Consensus"
            value="Proof of Stake"
            note="mining ended at block 100; every block since is staked"
          />
          <Row
            label="Next lottery block"
            value={nextLottery ? nextLottery.toLocaleString() : "—"}
            note={blocksToLottery ? `${blocksToLottery.toLocaleString()} blocks — ${eta(blocksToLottery)}` : ""}
          />
          <Row
            label="Next treasury block"
            value={nextTreasury ? nextTreasury.toLocaleString() : "—"}
          />
          <Row
            label="Lottery cycle"
            value={`${LOTTERY_CYCLE.toLocaleString()} blocks`}
            note="about a week"
          />
          <Row label="Treasury cycle" value={`${TREASURY_CYCLE.toLocaleString()} blocks`} />
        </dl>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Wallets and holdings</h2>
        <p className="wl-note">
          {/* Say plainly where these come from — the node genuinely cannot
              answer them, and a reader deserves to know it's our own index. */}
          From a full scan of the chain. The node can describe a single address but can never rank
          them all, and it doesn't see vault holdings at all.
        </p>
        {scan ? (
          <dl className="kv stats-kv">
            <Row
              label="Addresses ever seen"
              value={scan.addresses.toLocaleString()}
              note="including those long since emptied"
            />
            <Row label="Addresses holding a balance" value={scan.holders.toLocaleString()} />
            <Row label="Addresses that have ever sent" value={scan.senders.toLocaleString()} />
            <Row label="Transactions (all)" value={scan.tx_total.toLocaleString()} />
            <Row
              label="Real payments"
              value={scan.tx_nonstake.toLocaleString()}
              note="staking and block rewards excluded"
            />
            <Row
              label="Held in vaults"
              value={`${fmtDivi(scan.sum_vaulted / 1e8)} DIVI`}
              note={`${((scan.sum_vaulted / Math.max(1, scan.sum_total)) * 100).toFixed(1)}% of supply`}
            />
            <Row
              label="Self-custodied"
              value={`${fmtDivi((scan.sum_total - scan.sum_vaulted) / 1e8)} DIVI`}
            />
            <Row label="Owners delegating a vault" value={scan.delegators.toLocaleString()} />
            <Row label="Delegates staking for others" value={scan.delegates.toLocaleString()} />
          </dl>
        ) : (
          <p className="muted">Loading the chain index…</p>
        )}
        {scan?.summary_built ? (
          <p className="muted stat-pending">
            Snapshot at block {scan.height.toLocaleString()}, built{" "}
            {new Date(scan.summary_built * 1000).toLocaleString()}.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="section-title">This node</h2>
        <p className="wl-note">
          {/* An important distinction: one node's view is not the network's. */}
          What this explorer's own node can see. Peer counts are its connections, not a census of
          the network — no node can see every other node.
        </p>
        <dl className="kv stats-kv">
          <Row
            label="Connections"
            value={node?.connections != null ? String(node.connections) : peers ? String(peers.length) : "—"}
          />
          <Row label="Node version" value={node?.version != null ? String(node.version) : "—"} />
          <Row
            label="Protocol version"
            value={node?.protocolversion != null ? String(node.protocolversion) : "—"}
          />
          <Row label="Node height" value={node?.blocks != null ? node.blocks.toLocaleString() : "—"} />
        </dl>
      </section>
    </>
  );
}
