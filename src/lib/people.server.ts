/**
 * The household's own names, as the banks print them.
 *
 * Assembled from what the household typed about themselves and from the holder
 * lines on accounts they have already confirmed — so "ABDIN HN", learned once
 * from a NatWest statement, is recognised on every later file.
 */
import { indexPersonNames, type PersonNameIndex } from "./people";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export async function loadPeopleIndex(
  supabase: Client,
  householdId: string,
): Promise<PersonNameIndex[]> {
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, display_name")
      .eq("household_id", householdId),
    supabase
      .from("accounts")
      .select("owner_profile_id, statement_holder")
      .eq("household_id", householdId)
      .not("statement_holder", "is", null),
  ]);

  const aliases = new Map<string, string[]>();
  for (const row of (accounts ?? []) as Array<Record<string, unknown>>) {
    const owner = row["owner_profile_id"] as string | null;
    const holder = row["statement_holder"] as string | null;
    if (!owner || !holder) continue;
    const list = aliases.get(owner) ?? [];
    list.push(holder);
    aliases.set(owner, list);
  }

  return ((profiles ?? []) as Array<Record<string, unknown>>).map((profile) =>
    indexPersonNames({
      id: profile["id"] as string,
      names: [
        profile["full_name"] as string | null,
        profile["display_name"] as string | null,
        ...(aliases.get(profile["id"] as string) ?? []),
      ],
    }),
  );
}
