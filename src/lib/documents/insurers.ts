/**
 * Insurers, so a policy shows a mark rather than a grey square.
 *
 * The same idea as the bank list: a short table of the names that actually
 * appear on UK policy documents, mapped to the domain the logo service knows
 * them by. Client-safe, no network.
 */

export type InsurerEntry = { name: string; domain: string; aliases?: string[] };

export const INSURERS: InsurerEntry[] = [
  { name: "Aviva", domain: "aviva.co.uk" },
  { name: "Legal & General", domain: "legalandgeneral.com", aliases: ["legal and general", "l&g"] },
  { name: "Royal London", domain: "royallondon.com" },
  { name: "Zurich", domain: "zurich.co.uk" },
  { name: "AIG", domain: "aig.co.uk", aliases: ["aig life"] },
  { name: "Vitality", domain: "vitality.co.uk", aliases: ["vitalitylife", "vitalityhealth"] },
  { name: "LV=", domain: "lv.com", aliases: ["lv", "liverpool victoria"] },
  { name: "Scottish Widows", domain: "scottishwidows.co.uk" },
  { name: "Guardian", domain: "guardian1821.co.uk", aliases: ["guardian financial"] },
  { name: "The Exeter", domain: "the-exeter.com", aliases: ["exeter friendly"] },
  { name: "Shepherds Friendly", domain: "shepherdsfriendly.co.uk" },
  { name: "Cirencester Friendly", domain: "cirencester-friendly.co.uk" },
  { name: "British Friendly", domain: "britishfriendly.com" },
  { name: "Bupa", domain: "bupa.co.uk" },
  { name: "AXA Health", domain: "axahealth.co.uk", aliases: ["axa", "axa ppp"] },
  { name: "WPA", domain: "wpa.org.uk" },
  { name: "Freedom Health", domain: "freedomhealthinsurance.co.uk" },
  { name: "Direct Line", domain: "directline.com" },
  { name: "Churchill", domain: "churchill.com" },
  { name: "Admiral", domain: "admiral.com" },
  { name: "Hastings Direct", domain: "hastingsdirect.com" },
  { name: "Ageas", domain: "ageas.co.uk" },
  { name: "esure", domain: "esure.com" },
  { name: "More Than", domain: "morethan.com", aliases: ["morethan"] },
  { name: "NFU Mutual", domain: "nfumutual.co.uk" },
  { name: "Hiscox", domain: "hiscox.co.uk" },
  { name: "Home & Legacy", domain: "homeandlegacy.co.uk" },
  { name: "Allianz", domain: "allianz.co.uk" },
  { name: "RSA", domain: "rsagroup.com" },
  { name: "Saga", domain: "saga.co.uk" },
  { name: "Halifax", domain: "halifax.co.uk" },
  { name: "Nationwide", domain: "nationwide.co.uk" },
  { name: "John Lewis", domain: "johnlewisfinance.com", aliases: ["john lewis finance"] },
  { name: "Post Office", domain: "postoffice.co.uk" },
  { name: "Staysure", domain: "staysure.co.uk" },
  { name: "Allianz Assistance", domain: "allianz-assistance.co.uk" },
  { name: "Misr Insurance", domain: "misrins.com.eg" },
  { name: "AXA Egypt", domain: "axa.com.eg" },
  { name: "Jordan Insurance", domain: "jicjo.com" },
];

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(insurance|assurance|life|health|limited|ltd|plc|uk|group)\b/g, " ")
    .replace(/[^a-z0-9&]/g, "")
    .trim();
}

export function findInsurer(name: string | null | undefined): InsurerEntry | null {
  if (!name) return null;
  const needle = normalise(name);
  if (!needle) return null;

  for (const insurer of INSURERS) {
    const candidates = [insurer.name, ...(insurer.aliases ?? [])].map(normalise);
    if (candidates.some((candidate) => candidate && (needle === candidate || needle.includes(candidate)))) {
      return insurer;
    }
  }
  return null;
}

export function insurerDomain(name: string | null | undefined): string | null {
  return findInsurer(name)?.domain ?? null;
}
