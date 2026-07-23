// Curated address labels ("Bitrue", "DiviGo", …), shown next to an address as
// "(Exchange)" or similar.
//
// DELIBERATELY EMPTY until each entry can be evidenced. A label on the rich list
// is a public claim about who controls someone's money, and a wrong one
// misrepresents real holdings, so nothing goes in here on a hunch. An address is
// only added when its owner is genuinely known: an exchange's published cold
// wallet, a service operator confirming their own address, or a documented
// on-chain fact.
//
// What was checked and rejected: the only DiviGo address on record was a
// per-user DEPOSIT address issued to one person, not a service wallet, and it
// holds nothing. No exchange address (Bitrue, AscendEX) could be evidenced at
// all. So the map stays empty rather than carrying a guess.
//
// To add one: append `{ address, name, kind, source }` where `source` records
// HOW it is known, so the claim is auditable later.

export type LabelKind = "exchange" | "service" | "team" | "burn" | "other";

export interface AddressLabel {
  name: string;
  kind: LabelKind;
  /** How this is known — an audit trail, never omitted. */
  source: string;
}

export const ADDRESS_LABELS: Record<string, AddressLabel> = {
  // Example of the shape, commented out so it's never rendered:
  // "D...": { name: "Bitrue", kind: "exchange", source: "Bitrue published cold wallet, 2026-..." },
};

/** Short parenthetical for a kind, e.g. "(Exchange)". */
const KIND_TAG: Record<LabelKind, string> = {
  exchange: "Exchange",
  service: "Service",
  team: "Team",
  burn: "Burn",
  other: "",
};

export function labelFor(address: string): AddressLabel | null {
  return ADDRESS_LABELS[address] ?? null;
}

export function labelTag(l: AddressLabel): string {
  const kind = KIND_TAG[l.kind];
  return kind ? `${l.name} (${kind})` : l.name;
}
