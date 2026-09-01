/**
 * Matching a name on a document to a person in the household.
 *
 * Payslips and policies name people the way their employer or insurer spells
 * them, which is rarely how they are stored here. The match has to be good
 * enough to file a payslip automatically and cautious enough never to file
 * Haya's income under Omar — so an ambiguous name matches nobody and the
 * document is left for a person to assign.
 */
import { similarity } from "../text";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type Person = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string;
};

export async function loadPeople(supabase: Client, householdId: string): Promise<Person[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, display_name, email")
    .eq("household_id", householdId);
  return (data ?? []) as Person[];
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|prof)\b\.?/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function namesOf(person: Person): string[] {
  return [person.full_name, person.display_name, person.email.split("@")[0]?.replace(/[._-]/g, " ")]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
}

/**
 * The household member a document names, or null.
 *
 * A surname alone is not enough in a household where two people share one, and
 * a first name alone is only enough when nobody else answers to it.
 */
export function matchPerson(name: string | null | undefined, people: Person[]): string | null {
  if (!name || !people.length) return null;
  const target = tokens(name);
  if (!target.length) return null;

  const scored = people.map((person) => {
    let best = 0;
    for (const candidate of namesOf(person)) {
      const theirs = tokens(candidate);
      if (!theirs.length) continue;

      const overlap = target.filter((token) => theirs.includes(token)).length;
      const full = similarity(target.join(" "), theirs.join(" "));

      // Both parts of a name matching is conclusive; one part is a hint.
      let score = 0;
      if (overlap >= 2) score = 1;
      else if (overlap === 1) score = 0.6;
      score = Math.max(score, full >= 0.9 ? 1 : full >= 0.7 ? 0.65 : 0);

      best = Math.max(best, score);
    }
    return { id: person.id, score: best };
  });

  const ranked = scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return null;
  if (top.score < 0.6) return null;
  // Two people scoring the same means the name does not distinguish them.
  if (ranked[1] && ranked[1].score >= top.score) return null;
  return top.id;
}
