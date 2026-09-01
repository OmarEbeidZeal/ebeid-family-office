import { useCallback, useMemo } from "react";
import { indexPersonNames, personLabel, suggestPerson, type PersonNameIndex } from "@/lib/people";
import { useAuth, type Profile } from "./useAuth";

/** What to call a member, shortest form first. */
export function memberName(profile: Pick<Profile, "display_name" | "full_name" | "email">) {
  return (
    personLabel(profile.display_name) ||
    personLabel(profile.full_name) ||
    personLabel(profile.email?.split("@")[0]) ||
    "Member"
  );
}

export type OwnerOption = { value: string; label: string };

/**
 * The owner choices offered anywhere something can belong to someone: each
 * household member — including anyone invited but not yet signed in — plus
 * Joint.
 *
 * Ownership is never taken from whoever uploaded the file. It comes from the
 * name printed on the statement, matched by the same routine the import
 * pipeline uses, and a person is only ever suggested — the answer is still
 * confirmed by hand.
 */
export function useOwners() {
  const { members, profile } = useAuth();

  const options = useMemo<OwnerOption[]>(
    () => [
      ...members.map((member) => ({
        value: member.id,
        label:
          memberName(member) +
          (member.id === profile?.id ? " (me)" : member.status === "pending" ? " (invited)" : ""),
      })),
      { value: "joint", label: "Joint" },
    ],
    [members, profile?.id],
  );

  const nameOf = useCallback(
    (ownerProfileId: string | null | undefined, isJoint?: boolean) => {
      if (isJoint) return "Joint";
      if (!ownerProfileId) return "Unassigned";
      const member = members.find((row) => row.id === ownerProfileId);
      return member ? memberName(member) : "Unassigned";
    },
    [members],
  );

  /**
   * Every spelling of every member's name, indexed once. `full_name` is what
   * a bank prints; `display_name` is what the household types.
   */
  const index = useMemo<PersonNameIndex[]>(
    () =>
      members.map((member) =>
        indexPersonNames({
          id: member.id,
          names: [member.full_name, member.display_name],
        }),
      ),
    [members],
  );

  /**
   * Which member the statement is in the name of — `Acct/Ownr/Nm` on a
   * CAMT.053, the holder line on a PDF. Withheld when two members fit, so a
   * suggestion is either right or absent.
   */
  const matchHolder = useCallback(
    (holder: string | null | undefined): Profile | null => {
      const hit = suggestPerson(holder, index);
      if (!hit) return null;
      return members.find((member) => member.id === hit.id) ?? null;
    },
    [index, members],
  );

  return { options, nameOf, matchHolder, members };
}

