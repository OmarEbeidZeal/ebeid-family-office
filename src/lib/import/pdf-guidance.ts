/**
 * What to say when a PDF cannot be read.
 *
 * Some exporters embed a font whose characters map to nothing, so the text
 * comes back with every digit blank. A balance of "£ ,   .  " is not a number
 * anyone should guess at, so the file fails — but failing with a shrug wastes
 * the household's time. The words usually survive even when the digits do not,
 * and they name the exporter, so the failure can name the export that works
 * instead of asking them to go and find one.
 */

export type PdfKind = "statement" | "document";

/** Letters only, lowercased: the missing digits and spaces stop mattering. */
function compact(text: string): string {
  return text.slice(0, 4000).toLowerCase().replace(/[^a-z]/g, "");
}

type Exporter = {
  key: string;
  /** Matched against the letters that survived the broken font. */
  matches: string[];
  /** Named in the failure so the household knows which app to open. */
  name: string;
  /** The route to the export that carries real figures. */
  route: string;
  /** What that export adds beyond the PDF, where it adds something. */
  extra?: string;
};

const EXPORTERS: Exporter[] = [
  {
    key: "trading212",
    // "Trading 212" loses its digits and its a's: "Tr ding    ".
    matches: ["trading", "trding"],
    name: "Trading 212",
    route: "History → Export statement → CSV",
    extra: "The CSV carries the orders as well as the cash, so it builds the portfolio too.",
  },
  {
    key: "ibkr",
    matches: ["interactivebrokers", "interctivebrokers", "ibkr"],
    name: "Interactive Brokers",
    route: "Performance & Reports → Statements → Activity → Format: CSV",
    extra: "The CSV carries the trades as well as the cash.",
  },
  {
    key: "revolut",
    matches: ["revolut"],
    name: "Revolut",
    route: "Account → Statement → Excel",
  },
  {
    key: "monzo",
    matches: ["monzo"],
    name: "Monzo",
    route: "Payments → Statements → Export as CSV",
  },
  {
    key: "starling",
    matches: ["starlingbank", "strlingbnk"],
    name: "Starling",
    route: "Account → Statements → Download CSV",
  },
  {
    key: "wise",
    matches: ["wisepayments", "wisepyments"],
    name: "Wise",
    route: "Balances → Statement → CAMT.053",
    extra: "That export reconciles to the penny, which no PDF of it can.",
  },
];

/** Which exporter produced this file, as far as its surviving words say. */
export function detectPdfExporter(text: string): Exporter | null {
  const letters = compact(text);
  for (const exporter of EXPORTERS) {
    if (exporter.matches.some((needle) => letters.includes(needle))) return exporter;
  }
  return null;
}

const OPENING =
  "This PDF's text layer does not map its own characters — the figures come out blank, so nothing in it can be read honestly.";

const DOCUMENT_OPENING =
  "This PDF's text layer does not map its own characters — the words come out blank, so nothing in it can be read honestly.";

/**
 * The failure a household reads. Where the exporter is known, it ends with the
 * two or three taps that produce a file this can read.
 */
export function unreadablePdfMessage(text: string, kind: PdfKind = "statement"): string {
  if (kind === "document") {
    return `${DOCUMENT_OPENING} Ask whoever issued it for a copy you can select text in, or add the details by hand.`;
  }

  const exporter = detectPdfExporter(text);
  if (!exporter) {
    return `${OPENING} Some brokers and app-only banks export PDFs like this; download the CSV or Excel version of the same statement instead.`;
  }

  return [
    OPENING,
    `${exporter.name} exports every PDF this way.`,
    `Download the same period from ${exporter.route} and upload that instead.`,
    exporter.extra,
  ]
    .filter(Boolean)
    .join(" ");
}
