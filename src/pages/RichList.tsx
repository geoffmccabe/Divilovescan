// Rich List — ranked by OWNER, not by whoever stakes the coins.
//
// This cannot come from the node: its address index has no way to rank all
// addresses, and it ignores Divi's vault script type entirely (~76% of staked
// value). The figures here come from our own chain scan, which attributes
// vaulted coins to the owner who can actually spend them.

export function RichListPage() {
  return (
    <section className="panel">
      <h2 className="section-title">Rich List</h2>
      <p className="wl-note">
        Ranked by owner. Coins held in a vault are counted for the owner — the person who can
        actually spend them — not for the delegate who stakes them on their behalf.
      </p>
      <p className="muted" style={{ marginBottom: 0 }}>
        Waiting on the chain scan. The node cannot answer this on its own: it can describe a single
        address, but never rank every address, and it does not see vault holdings at all.
      </p>
    </section>
  );
}
