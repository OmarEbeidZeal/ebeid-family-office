/**
 * Recognising the household's own names on a statement.
 *
 * Two jobs, both of which go wrong quietly when they are guessed at.
 *
 * The first is ownership. A NatWest statement headed `ABDIN HN` is Haya's
 * account even when Omar is the one who uploaded it, and defaulting to the
 * uploader files a year of her spending under his name. The name printed on
 * the page is the evidence; the uploader is not evidence of anything.
 *
 * The second is transfers. The largest single credit in this household's Monzo
 * data is Omar paying himself £90,979. Matching paired amounts across accounts
 * cannot see it — the other side of it is in an account that was never
 * imported — so the counterparty name has to be read. Get that wrong in the
 * other direction and a salary from an employer whose narrative happens to
 * carry the employee's name disappears from income, so the automatic rung is
 * deliberately strict: every word in the counterparty must belong to the
 * person, or it is not them.
 *
 * Pure, and shared by the import pipeline and the proposals screen.
 */

/** Dropped before matching: they say nothing about who someone is. */
const TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "prof",
  "sir",
  "dame",
  "lady",
  "rev",
  "the",
]);

/**
 * Words a bank wraps around a name. Removing them is what lets
 * "TRANSFER TO OMAR EBEID" read as a name and nothing else.
 */
const NOISE = new Set([
  "transfer",
  "transfers",
  "trf",
  "tfr",
  "xfer",
  "from",
  "to",
  "payment",
  "payments",
  "pmt",
  "pay",
  "paid",
  "faster",
  "fps",
  "bacs",
  "chaps",
  "sepa",
  "swift",
  "ref",
  "reference",
  "account",
  "acct",
  "savings",
  "saving",
  "current",
  "internal",
  "own",
  "self",
  "via",
  "sent",
  "send",
  "received",
  "receive",
  "deposit",
  "withdrawal",
  "topup",
  "top",
  "up",
  "in",
  "out",
  "and",
  "ltd",
  "limited",
  "pot",
  "monzo",
  "wise",
  "transferwise",
  "revolut",
  "starling",
  "and",
]);

/**
 * A person's name as it should read on screen.
 *
 * A name typed entirely in lower case — "omar" — is a keyboard artefact, not a
 * choice, and reads badly as the heading of a mandate or an allowance. Any
 * name carrying deliberate casing is left exactly as the household wrote it,
 * so "de Souza", "McKay" and "HAYA" all survive untouched.
 */
export function personLabel(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "";
  if (name !== name.toLowerCase()) return name;
  return name.replace(/(^|[\s'’-])([a-z])/g, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

/** Lower-case alphabetic words. Anything carrying a digit is a reference. */

export function nameTokens(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z\s'-]+/g, " ")
    .split(/[\s'-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !TITLES.has(word));
}

export type PersonNameSource = {
  id: string;
  /** Every way this person's name has been seen written. */
  names: Array<string | null | undefined>;
};

export type PersonNameIndex = {
  id: string;
  /** Words of two letters or more, from every known spelling of the name. */
  words: Set<string>;
  /** First letters of those words, so "O EBEID" still reads as Omar. */
  initials: Set<string>;
};

export function indexPersonNames(source: PersonNameSource): PersonNameIndex {
  const words = new Set<string>();
  const initials = new Set<string>();

  for (const name of source.names) {
    for (const token of nameTokens(name)) {
      if (token.length >= 2) {
        words.add(token);
        initials.add(token[0]!);
      }
    }
  }

  return { id: source.id, words, initials };
}

type Evidence = {
  /** Whole names that belong to this person: "omar", "ebeid". */
  fullWords: number;
  /** Initial bundles that fit: "o", "hn". */
  initialGroups: number;
  /** Tokens the person does not explain at all. */
  unexplained: string[];
};

/**
 * Weigh a run of words against one person. An initial bundle counts when its
 * first letter is one of the person's — "HN" for Haya Nour, "O" for Omar —
 * because middle names are printed by banks and stored by nobody.
 */
function weigh(tokens: string[], person: PersonNameIndex): Evidence {
  let fullWords = 0;
  let initialGroups = 0;
  const unexplained: string[] = [];

  for (const token of tokens) {
    if (token.length >= 3 && person.words.has(token)) {
      fullWords += 1;
      continue;
    }
    if (token.length <= 3 && person.initials.has(token[0]!)) {
      initialGroups += 1;
      continue;
    }
    if (token.length === 2 && person.words.has(token)) {
      fullWords += 1;
      continue;
    }
    unexplained.push(token);
  }

  return { fullWords, initialGroups, unexplained };
}

/** Tokens with the bank's own wrapper words taken out. */
export function counterpartyTokens(raw: string | null | undefined): string[] {
  return nameTokens(raw).filter((token) => !NOISE.has(token));
}

/**
 * The strict rung, used where the answer is acted on without anyone seeing it.
 *
 * Every word must belong to the person and there must be at least two pieces
 * of evidence, so "OMAR EBEID" and "ABDIN HN" match while "ZEAL LTD OMAR EBEID
 * SALARY" does not — that one is a wage, and hiding it would take six figures
 * out of the household's income.
 */
export function ownNameHit(
  text: string | null | undefined,
  people: PersonNameIndex[],
): PersonNameIndex | null {
  const tokens = counterpartyTokens(text);
  if (tokens.length < 2 || tokens.length > 6) return null;

  for (const person of people) {
    const evidence = weigh(tokens, person);
    if (evidence.unexplained.length > 0) continue;
    if (evidence.fullWords < 1) continue;
    if (evidence.fullWords + evidence.initialGroups < 2) continue;
    return person;
  }

  return null;
}

/**
 * The lenient rung, used only to point at an answer a human then confirms.
 *
 * One unrecognised word is tolerated — a middle name the household has never
 * typed in — but the suggestion is withheld when two people fit, because a
 * suggestion that is wrong half the time is worse than none.
 */
export function suggestPerson(
  holder: string | null | undefined,
  people: PersonNameIndex[],
): PersonNameIndex | null {
  const tokens = counterpartyTokens(holder);
  if (!tokens.length) return null;

  const fits = people.filter((person) => {
    const evidence = weigh(tokens, person);
    if (evidence.unexplained.length > 1) return false;
    if (evidence.fullWords < 1) return false;
    return evidence.fullWords + evidence.initialGroups >= 2 || tokens.length === 1;
  });

  return fits.length === 1 ? fits[0]! : null;
}
