/**
 * An account cannot exist without a stated owner.
 *
 * Two people upload to this household and one of the brokers prints no name on
 * its exports, so a default owner is a coin toss recorded as fact: Haya's ISA
 * became Omar's and the allowance tracking followed it. Confirming a proposal
 * refuses until someone has been chosen.
 */
import { describe, expect, it } from "vitest";
import { resolveProposal } from "./proposals.server";

type Row = Record<string, unknown>;

/** The narrowest client the code path touches: read the proposal, read a profile. */
function fakeClient(proposal: Row, profiles: Row[] = []) {
  const inserted: Row[] = [];
  const builder = (table: string) => {
    const state: Row = {};
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        state[column] = value;
        return api;
      },
      in: () => api,
      not: () => api,
      order: () => api,
      limit: () => api,
      update: () => api,
      insert: (values: Row) => {
        inserted.push({ table, ...values });
        return api;
      },
      maybeSingle: async () => {
        if (table === "account_proposals") return { data: proposal, error: null };
        if (table === "profiles") {
          const hit = profiles.find((row) => row["id"] === state["id"]);
          return { data: hit ?? null, error: null };
        }
        if (table === "households") return { data: { base_currency: "GBP" }, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    };
    return api;
  };
  return {
    client: { from: (table: string) => builder(table) },
    inserted,
  };
}

const proposal = {
  id: "p1",
  household_id: "h1",
  institution: "Trading 212",
  institution_domain: "trading212.com",
  currency: "GBP",
  account_type: "isa",
  suggested_nickname: "Trading 212 ISA",
  holder: null,
  identifier_last4: null,
  identifier_kind: null,
  closing_balance: null,
  closing_balance_date: null,
  period_end: null,
};

describe("confirming a proposed account", () => {
  it("refuses to create an account with no owner chosen", async () => {
    const { client, inserted } = fakeClient(proposal);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveProposal(client as any, {
        householdId: "h1",
        profileId: "me",
        proposalId: "p1",
        action: "create",
      }),
    ).rejects.toThrow(/who owns this account/i);
    expect(inserted.filter((row) => row["table"] === "accounts")).toHaveLength(0);
  });

  it("refuses an empty or whitespace owner just the same", async () => {
    const { client } = fakeClient(proposal);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveProposal(client as any, {
        householdId: "h1",
        profileId: "me",
        proposalId: "p1",
        action: "create",
        ownership: "   ",
      }),
    ).rejects.toThrow(/who owns this account/i);
  });

  it("refuses someone outside the household", async () => {
    const { client } = fakeClient(proposal, [{ id: "in-household" }]);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveProposal(client as any, {
        householdId: "h1",
        profileId: "me",
        proposalId: "p1",
        action: "create",
        ownership: "someone-else",
      }),
    ).rejects.toThrow(/not part of this household/i);
  });
});
