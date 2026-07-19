import { NetworkMap } from "../map/NetworkMap";

// Network Map — a port of the wallet's map. Peers come from our node, their
// locations from IP geolocation (cached server-side, since an address's city
// doesn't move). Transactions have no location on a blockchain, so nothing here
// pretends to show where a payment came from; it is network topology only.

export function NetworkPage() {
  return (
    <section className="panel netmap-panel">
      <h2 className="section-title">Network Map</h2>
      <p className="wl-note">
        Divi nodes this explorer is connected to, and the wider set it has seen recently. The gold
        marker labelled SCANNER / NODE is this explorer's own node.
      </p>
      <NetworkMap />
    </section>
  );
}
