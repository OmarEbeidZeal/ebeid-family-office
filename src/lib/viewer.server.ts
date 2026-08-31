/**
 * Who is asking, and which household record they are.
 *
 * A login and a household member are no longer the same row. Haya can own
 * accounts before she has ever signed in, so every server path that used to
 * treat `auth.uid()` as a profile id has to resolve it properly instead.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type Viewer = {
  /** The `profiles` row id — what every `*_profile_id` column points at. */
  profileId: string;
  householdId: string;
  role: string;
};

export class NoProfileError extends Error {}

export async function resolveViewer(supabase: Client, userId: string): Promise<Viewer> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, household_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not read your household membership: ${error.message}`);
  if (!data?.household_id) {
    throw new NoProfileError("No household is linked to this account.");
  }

  return {
    profileId: data.id as string,
    householdId: data.household_id as string,
    role: (data.role as string) ?? "member",
  };
}
