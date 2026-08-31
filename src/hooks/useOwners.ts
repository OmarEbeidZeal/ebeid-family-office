import { useCallback, useMemo } from "react";
import { useAuth, type Profile } from "./useAuth";

/** What to call a member, shortest form first. */
export function memberName(profile: Pick<Profile, "display_name" | "full_name" | "email">) {
  return (
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    profile.email?.split("@")[0] ||
    "Member"
  );
}

export type OwnerOption = { value: string; label: string };

/**
 * The owner choices offered anywhere something can belong to someone: each
 * household member — including anyone invited but not yet signed in — plus
 * Joint. Never pre-selected on discovery; ownership is a decision.
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
   * Does the statement's holder name look like this member? Used only to
   * point at the likely answer, never to choose it.
   */
  const matchHolder = useCallback(
    (holder: string | null | undefined): Profile | null => {
      const value = (holder ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").trim();
      if (!value) return null;
      const words = value.split(/\s+/).filter(Boolean);
      if (!words.length) return null;
      const surname = words[words.length - 1]!;

      for (const member of members) {
        const parts = (member.full_name ?? memberName(member))
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        if (!parts.length) continue;
        const memberSurname = parts[parts.length - 1]!;
        if (memberSurname !== surname) continue;
        // "H Abdin" against "Haya Abdin": the initial has to agree too.
        const first = words.length > 1 ? words[0]! : null;
        const memberFirst = parts[0]!;
        if (!first || first[0] === memberFirst[0]) return member;
      }
      return null;
    },
    [members],
  );

  return { options, nameOf, matchHolder, members };
}
