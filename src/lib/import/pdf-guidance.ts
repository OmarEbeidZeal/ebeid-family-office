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
 * The exact words a household sees when a PDF's numerals did not survive.
 * Said first, and plainly: the file is not being imported.
 */
export const DIGITS_LOST_MESSAGE =
  "This PDF's text could not be read reliably — export CSV or XML from your bank instead.";

function exporterRoute(text: string): string[] {
  const exporter = detectPdfExporter(text);
  if (!exporter) return [];
  return [
    `${exporter.name} exports every PDF this way.`,
    `Download the same period from ${exporter.route} and upload that instead.`,
    exporter.extra ?? "",
  ].filter(Boolean);
}

/**
 * The failure a household reads. Where the exporter is known, it ends with the
 * two or three taps that produce a file this can read.
 */
export function unreadablePdfMessage(text: string, kind: PdfKind = "statement"): string {
  if (kind === "document") {
    return `${DOCUMENT_OPENING} Ask whoever issued it for a copy you can select text in, or add the details by hand.`;
  }

  const route = exporterRoute(text);
  if (!route.length) {
    return `${OPENING} Some brokers and app-only banks export PDFs like this; download the CSV or Excel version of the same statement instead.`;
  }

  return [OPENING, ...route].join(" ");
}

/**
 * A summary document rather than a transaction export.
 *
 * Trading 212's "Activity Statement" and "Annual Statement" are year-end
 * summaries: they restate the same orders and cash the CSV export already
 * carries, in a PDF whose font maps no digits. Telling the household to
 * download a better copy of it would send them after a file that adds nothing
 * — so the failure says what the document is, and that nothing is missing.
 */
function summaryStatementLabel(text: string): "activity" | "annual" | null {
  const letters = compact(text);
  if (letters.includes("activitystatement")) return "activity";
  if (letters.includes("annualstatement")) return "annual";
  return null;
}

/**
 * A file whose words came through and whose figures did not. The opening
 * sentence is fixed; the exporter's own export route is added when the
 * surviving words name it.
 */
export function digitsLostPdfMessage(text: string, kind: PdfKind = "statement"): string {
  if (kind === "document") {
    return `${DIGITS_LOST_MESSAGE} If it is not a bank document, ask whoever issued it for a copy you can select the figures in, or add the details by hand.`;
  }

  const summary = summaryStatementLabel(text);
  if (summary) {
    const exporter = detectPdfExporter(text);
    const whose = exporter ? `${exporter.name}'s ` : "";
    const route = exporter ? `${exporter.name}'s CSV exports` : "the CSV exports";
    return [
      `This is ${whose}${summary === "activity" ? "activity statement" : "annual statement"}, not a transaction export.`,
      "Its figures cannot be read because the PDF's font maps no digits at all, so importing it would mean inventing the numbers.",
      `${route} carry the same orders and the same cash movements.`,
      "If those CSVs are already imported, nothing is missing and there is nothing to upload again.",
    ].join(" ");
  }

  const route = exporterRoute(text);
  if (!route.length) {
    return `${DIGITS_LOST_MESSAGE} Every figure on the page came back blank, so importing it would mean inventing the numbers.`;
  }

  return [DIGITS_LOST_MESSAGE, ...route].join(" ");
}

