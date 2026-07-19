// Network Map — port of the wallet's map, showing peers, their locations and
// the connections between them. "SCANNER / NODE" marks this explorer's own node
// where the wallet shows "YOU".

export function NetworkPage() {
  return (
    <section className="panel">
      <h2 className="section-title">Network Map</h2>
      <p className="wl-note">
        Divi nodes around the world, their connections, and where this explorer's node sits among
        them.
      </p>
      <p className="muted" style={{ marginBottom: 0 }}>
        Being ported from the wallet. The map itself is the largest single piece of that app, and
        the live peer probing and location lookups behind it run in the wallet's own backend — both
        need web equivalents before this can be faithful rather than a rough copy.
      </p>
    </section>
  );
}
