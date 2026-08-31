/**
 * Institution → web domain, so a bank can carry its own logo.
 *
 * The list covers the banks and brokers this household actually deals with —
 * UK high street and challengers, Egypt, Jordan, the Gulf and the US brokers —
 * plus a normaliser that copes with how a statement prints a name ("HSBC UK
 * Bank plc", "Commercial International Bank (Egypt) S.A.E."). Statements are
 * English-language, so matching is Latin-script only; anything unrecognised
 * gets a monogram rather than a wrong logo.
 */

export type BankEntry = {
  domain: string;
  /** Canonical display name. */
  name: string;
  country: string;
  /** Lower-case fragments that identify the bank in statement text. */
  aliases: string[];
};

export const BANKS: BankEntry[] = [
  /* ------------------------------------------------------------ United Kingdom */
  { domain: "hsbc.co.uk", name: "HSBC UK", country: "GB", aliases: ["hsbc"] },
  {
    domain: "barclays.co.uk",
    name: "Barclays",
    country: "GB",
    aliases: ["barclays", "barclaycard"],
  },
  { domain: "lloydsbank.com", name: "Lloyds Bank", country: "GB", aliases: ["lloyds"] },
  {
    domain: "natwest.com",
    name: "NatWest",
    country: "GB",
    aliases: ["natwest", "national westminster"],
  },
  { domain: "santander.co.uk", name: "Santander UK", country: "GB", aliases: ["santander"] },
  { domain: "halifax.co.uk", name: "Halifax", country: "GB", aliases: ["halifax"] },
  { domain: "nationwide.co.uk", name: "Nationwide", country: "GB", aliases: ["nationwide"] },
  { domain: "tsb.co.uk", name: "TSB", country: "GB", aliases: ["tsb bank", "tsb"] },
  {
    domain: "rbs.co.uk",
    name: "Royal Bank of Scotland",
    country: "GB",
    aliases: ["royal bank of scotland", "rbs"],
  },
  {
    domain: "bankofscotland.co.uk",
    name: "Bank of Scotland",
    country: "GB",
    aliases: ["bank of scotland"],
  },
  {
    domain: "co-operativebank.co.uk",
    name: "The Co-operative Bank",
    country: "GB",
    aliases: ["co-operative bank", "co op bank"],
  },
  { domain: "metrobankonline.co.uk", name: "Metro Bank", country: "GB", aliases: ["metro bank"] },
  { domain: "virginmoney.com", name: "Virgin Money", country: "GB", aliases: ["virgin money"] },
  { domain: "starlingbank.com", name: "Starling Bank", country: "GB", aliases: ["starling"] },
  { domain: "monzo.com", name: "Monzo", country: "GB", aliases: ["monzo"] },
  { domain: "revolut.com", name: "Revolut", country: "GB", aliases: ["revolut"] },
  { domain: "wise.com", name: "Wise", country: "GB", aliases: ["wise", "transferwise"] },
  { domain: "chase.co.uk", name: "Chase UK", country: "GB", aliases: ["chase uk"] },
  { domain: "marcus.co.uk", name: "Marcus by Goldman Sachs", country: "GB", aliases: ["marcus"] },
  { domain: "atombank.co.uk", name: "Atom Bank", country: "GB", aliases: ["atom bank"] },
  { domain: "zopa.com", name: "Zopa", country: "GB", aliases: ["zopa"] },
  { domain: "tandem.co.uk", name: "Tandem Bank", country: "GB", aliases: ["tandem"] },
  { domain: "aldermore.co.uk", name: "Aldermore", country: "GB", aliases: ["aldermore"] },
  { domain: "shawbrook.co.uk", name: "Shawbrook Bank", country: "GB", aliases: ["shawbrook"] },
  { domain: "paragonbank.co.uk", name: "Paragon Bank", country: "GB", aliases: ["paragon bank"] },
  { domain: "coutts.com", name: "Coutts", country: "GB", aliases: ["coutts"] },
  {
    domain: "handelsbanken.co.uk",
    name: "Handelsbanken",
    country: "GB",
    aliases: ["handelsbanken"],
  },
  { domain: "investec.com", name: "Investec", country: "GB", aliases: ["investec"] },
  { domain: "firstdirect.com", name: "first direct", country: "GB", aliases: ["first direct"] },
  { domain: "cynergybank.co.uk", name: "Cynergy Bank", country: "GB", aliases: ["cynergy"] },
  {
    domain: "americanexpress.com",
    name: "American Express",
    country: "GB",
    aliases: ["american express", "amex"],
  },

  /* -------------------------------------------------- UK investment platforms */
  {
    domain: "hl.co.uk",
    name: "Hargreaves Lansdown",
    country: "GB",
    aliases: ["hargreaves lansdown", "hargreaves"],
  },
  { domain: "ajbell.co.uk", name: "AJ Bell", country: "GB", aliases: ["aj bell", "youinvest"] },
  {
    domain: "interactiveinvestor.co.uk",
    name: "interactive investor",
    country: "GB",
    aliases: ["interactive investor"],
  },
  { domain: "vanguardinvestor.co.uk", name: "Vanguard UK", country: "GB", aliases: ["vanguard"] },
  { domain: "freetrade.io", name: "Freetrade", country: "GB", aliases: ["freetrade"] },
  {
    domain: "trading212.com",
    name: "Trading 212",
    country: "GB",
    aliases: ["trading 212", "trading212"],
  },
  { domain: "nutmeg.com", name: "Nutmeg", country: "GB", aliases: ["nutmeg"] },
  { domain: "moneyfarm.com", name: "Moneyfarm", country: "GB", aliases: ["moneyfarm"] },
  {
    domain: "fidelity.co.uk",
    name: "Fidelity International",
    country: "GB",
    aliases: ["fidelity"],
  },
  {
    domain: "charles-stanley.co.uk",
    name: "Charles Stanley",
    country: "GB",
    aliases: ["charles stanley"],
  },

  /* --------------------------------------------------------------------- Egypt */
  {
    domain: "cibeg.com",
    name: "Commercial International Bank",
    country: "EG",
    aliases: ["commercial international bank", "cib"],
  },
  {
    domain: "nbe.com.eg",
    name: "National Bank of Egypt",
    country: "EG",
    aliases: ["national bank of egypt", "nbe"],
  },
  {
    domain: "banquemisr.com",
    name: "Banque Misr",
    country: "EG",
    aliases: ["banque misr"],
  },
  {
    domain: "qnbalahli.com",
    name: "QNB Alahli",
    country: "EG",
    aliases: ["qnb alahli", "qnb al ahli"],
  },
  {
    domain: "aaib.com",
    name: "Arab African International Bank",
    country: "EG",
    aliases: ["arab african", "aaib"],
  },
  {
    domain: "banqueducaire.com",
    name: "Banque du Caire",
    country: "EG",
    aliases: ["banque du caire"],
  },
  { domain: "hsbc.com.eg", name: "HSBC Egypt", country: "EG", aliases: ["hsbc egypt"] },
  {
    domain: "alexbank.com",
    name: "Bank of Alexandria",
    country: "EG",
    aliases: ["bank of alexandria", "alexbank"],
  },
  {
    domain: "adib.eg",
    name: "ADIB Egypt",
    country: "EG",
    aliases: ["abu dhabi islamic bank egypt", "adib egypt"],
  },
  {
    domain: "ca-egypt.com",
    name: "Crédit Agricole Egypt",
    country: "EG",
    aliases: ["credit agricole egypt", "crédit agricole egypt"],
  },
  {
    domain: "eg.faisalbank.com",
    name: "Faisal Islamic Bank",
    country: "EG",
    aliases: ["faisal islamic"],
  },
  {
    domain: "hdb-egy.com",
    name: "Housing and Development Bank",
    country: "EG",
    aliases: ["housing and development bank"],
  },
  {
    domain: "attijariwafabank.com.eg",
    name: "Attijariwafa Bank Egypt",
    country: "EG",
    aliases: ["attijariwafa"],
  },
  {
    domain: "ebebank.com",
    name: "Export Development Bank of Egypt",
    country: "EG",
    aliases: ["export development bank"],
  },
  {
    domain: "nbk.com",
    name: "NBK Egypt",
    country: "EG",
    aliases: ["national bank of kuwait egypt", "nbk egypt"],
  },
  { domain: "sc.com", name: "Standard Chartered", country: "EG", aliases: ["standard chartered"] },
  {
    domain: "efghermes.com",
    name: "EFG Hermes",
    country: "EG",
    aliases: ["efg hermes", "efg holding"],
  },
  { domain: "cicapital.com", name: "CI Capital", country: "EG", aliases: ["ci capital"] },

  /* -------------------------------------------------------------------- Jordan */
  {
    domain: "arabbank.com",
    name: "Arab Bank",
    country: "JO",
    aliases: ["arab bank"],
  },
  {
    domain: "hbtf.com",
    name: "Housing Bank for Trade and Finance",
    country: "JO",
    aliases: ["housing bank"],
  },
  {
    domain: "bankofjordan.com",
    name: "Bank of Jordan",
    country: "JO",
    aliases: ["bank of jordan"],
  },
  {
    domain: "jordanislamicbank.com",
    name: "Jordan Islamic Bank",
    country: "JO",
    aliases: ["jordan islamic"],
  },
  {
    domain: "jkb.com",
    name: "Jordan Kuwait Bank",
    country: "JO",
    aliases: ["jordan kuwait bank", "jkb"],
  },
  {
    domain: "cab.jo",
    name: "Cairo Amman Bank",
    country: "JO",
    aliases: ["cairo amman"],
  },
  {
    domain: "capitalbank.jo",
    name: "Capital Bank of Jordan",
    country: "JO",
    aliases: ["capital bank"],
  },
  {
    domain: "bankaletihad.com",
    name: "Bank al Etihad",
    country: "JO",
    aliases: ["bank al etihad", "etihad bank"],
  },
  {
    domain: "ahli.com",
    name: "Jordan Ahli Bank",
    country: "JO",
    aliases: ["jordan ahli", "ahli bank"],
  },
  {
    domain: "sgbj.com.jo",
    name: "Société Générale Jordan",
    country: "JO",
    aliases: ["societe generale jordan"],
  },
  {
    domain: "invesbank.com",
    name: "InvestBank",
    country: "JO",
    aliases: ["investbank", "invest bank"],
  },
  { domain: "safwabank.com", name: "Safwa Islamic Bank", country: "JO", aliases: ["safwa"] },
  {
    domain: "iiabank.com.jo",
    name: "Jordan Islamic Arab Bank",
    country: "JO",
    aliases: ["islamic international arab bank", "iiab"],
  },

  /* ----------------------------------------------------------------- Gulf / MEA */
  { domain: "emiratesnbd.com", name: "Emirates NBD", country: "AE", aliases: ["emirates nbd"] },
  {
    domain: "adcb.com",
    name: "ADCB",
    country: "AE",
    aliases: ["abu dhabi commercial bank", "adcb"],
  },
  { domain: "mashreq.com", name: "Mashreq", country: "AE", aliases: ["mashreq"] },
  {
    domain: "fab.ae",
    name: "First Abu Dhabi Bank",
    country: "AE",
    aliases: ["first abu dhabi", "fab"],
  },
  { domain: "alrajhibank.com.sa", name: "Al Rajhi Bank", country: "SA", aliases: ["al rajhi"] },
  {
    domain: "alahli.com",
    name: "Saudi National Bank",
    country: "SA",
    aliases: ["saudi national bank", "snb"],
  },
  { domain: "qnb.com", name: "QNB", country: "QA", aliases: ["qatar national bank"] },

  /* -------------------------------------------------------------- United States */
  { domain: "chase.com", name: "Chase", country: "US", aliases: ["jpmorgan chase", "chase bank"] },
  {
    domain: "bankofamerica.com",
    name: "Bank of America",
    country: "US",
    aliases: ["bank of america"],
  },
  { domain: "citi.com", name: "Citi", country: "US", aliases: ["citibank", "citi"] },
  { domain: "wellsfargo.com", name: "Wells Fargo", country: "US", aliases: ["wells fargo"] },
  {
    domain: "schwab.com",
    name: "Charles Schwab",
    country: "US",
    aliases: ["charles schwab", "schwab"],
  },
  { domain: "fidelity.com", name: "Fidelity", country: "US", aliases: ["fidelity investments"] },
  { domain: "vanguard.com", name: "Vanguard", country: "US", aliases: ["vanguard group"] },
  {
    domain: "interactivebrokers.com",
    name: "Interactive Brokers",
    country: "US",
    aliases: ["interactive brokers", "ibkr"],
  },
  { domain: "robinhood.com", name: "Robinhood", country: "US", aliases: ["robinhood"] },
  { domain: "etrade.com", name: "E*TRADE", country: "US", aliases: ["etrade", "e*trade"] },
  {
    domain: "morganstanley.com",
    name: "Morgan Stanley",
    country: "US",
    aliases: ["morgan stanley"],
  },
  { domain: "coinbase.com", name: "Coinbase", country: "US", aliases: ["coinbase"] },
  { domain: "kraken.com", name: "Kraken", country: "US", aliases: ["kraken"] },
  { domain: "binance.com", name: "Binance", country: "US", aliases: ["binance"] },
  { domain: "paypal.com", name: "PayPal", country: "US", aliases: ["paypal"] },
];

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Best match for an institution name as a statement prints it. */
export function findBank(institution: string | null | undefined): BankEntry | null {
  if (!institution) return null;
  const needle = normalise(institution);
  if (!needle) return null;

  let best: { entry: BankEntry; score: number } | null = null;
  for (const entry of BANKS) {
    for (const alias of [entry.name, ...entry.aliases]) {
      const candidate = normalise(alias);
      if (!candidate) continue;
      const hit = needle === candidate || needle.includes(candidate) || candidate.includes(needle);
      if (!hit) continue;
      const score = candidate.length + (needle === candidate ? 100 : 0);
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best?.entry ?? null;
}

export function bankDomain(institution: string | null | undefined): string | null {
  return findBank(institution)?.domain ?? null;
}

/**
 * BIC (or the four-letter institution code inside an IBAN) → the bank's name.
 *
 * Structured statements name the bank by code rather than in words, so this is
 * how CAMT.053 and MT940 get a logo and a readable institution. Only codes we
 * are sure of are listed: a wrong bank name is worse than none, and anything
 * unlisted simply falls through to a monogram.
 */
const BIC_INSTITUTIONS: Record<string, string> = {
  MIDL: "HSBC UK",
  HBUK: "HSBC UK",
  BARC: "Barclays",
  BUKB: "Barclays",
  LOYD: "Lloyds Bank",
  NWBK: "NatWest",
  RBOS: "Royal Bank of Scotland",
  BOFS: "Bank of Scotland",
  HLFX: "Halifax",
  ABBY: "Santander UK",
  NAIA: "Nationwide",
  TSBS: "TSB",
  MONZ: "Monzo",
  SRLG: "Starling Bank",
  REVO: "Revolut",
  CITI: "Citibank",
  CHAS: "JPMorgan Chase",
  BOFA: "Bank of America",
  NBEG: "National Bank of Egypt",
  CIBE: "Commercial International Bank",
  BMISEGCX: "Banque Misr",
  ARAB: "Arab Bank",
  BJOR: "Bank of Jordan",
  HBHO: "Housing Bank for Trade and Finance",
};

export function bankFromBic(bic: string | null | undefined): string | null {
  const value = (bic ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (value.length < 4) return null;
  return BIC_INSTITUTIONS[value] ?? BIC_INSTITUTIONS[value.slice(0, 4)] ?? null;
}

/** Two letters at most, from the words that carry meaning. */
export function monogram(value: string | null | undefined): string {
  const words = (value ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 0 &&
        !["the", "of", "and", "plc", "ltd", "limited", "sae", "sa", "psc"].includes(
          word.toLowerCase(),
        ),
    );
  if (!words.length) return "··";
  const first = words[0]!;
  // A bank that prints itself as an acronym — HSBC, CIB, NBE, ADCB — reads
  // better as the first two letters of that acronym than as two initials.
  if (/^[A-Z0-9]{2,}$/.test(first)) return first.slice(0, 2);
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${words[1]![0]}`.toUpperCase();
}
