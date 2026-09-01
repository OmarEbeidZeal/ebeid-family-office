import { describe, expect, it } from "vitest";
import { buildIsaTracker } from "@/lib/isa";

const MEMBERS = [
  { id: "p1", name: "Omar" },
  { id: "p2", name: "Haya" },
];

/** Mid-tax-year, well clear of the 5 April deadline. */
const MID_YEAR = new Date("2026-09-01T12:00:00Z");
/** Inside the last sixty days of the tax year. */
const LATE_YEAR = new Date("2027-03-01T12:00:00Z");

describe("buildIsaTracker", () => {
  it("reports a member with nothing recorded as unknown, not as having the full allowance", () => {
    const tracker = buildIsaTracker({ members: MEMBERS, allowances: [], now: MID_YEAR });
    expect(tracker.taxYear).toBe("2026/27");
    expect(tracker.unrecordedCount).toBe(2);
    expect(tracker.people.every((person) => person.status === "unknown")).toBe(true);
    expect(tracker.people.every((person) => person.recorded === false)).toBe(true);
  });

  it("gives the household two allowances, one per person", () => {
    const tracker = buildIsaTracker({
      members: MEMBERS,
      allowances: [{ profile_id: "p1", tax_year: "2026/27", isa_used: 8_000 }],
      now: MID_YEAR,
    });
    expect(tracker.allowanceBase).toBe(20_000);
    expect(tracker.householdCapacityBase).toBe(40_000);
    expect(tracker.householdUsedBase).toBe(8_000);
    expect(tracker.householdRemainingBase).toBe(32_000);
  });

  it("only reads an allowance row from the current tax year", () => {
    const tracker = buildIsaTracker({
      members: MEMBERS,
      allowances: [{ profile_id: "p1", tax_year: "2025/26", isa_used: 20_000 }],
      now: MID_YEAR,
    });
    expect(tracker.people.find((p) => p.profileId === "p1")?.usedBase).toBe(0);
    expect(tracker.people.find((p) => p.profileId === "p1")?.recorded).toBe(false);
  });

  it("raises the second-allowance question when one person funds and the other does not", () => {
    const tracker = buildIsaTracker({
      members: MEMBERS,
      allowances: [
        { profile_id: "p1", tax_year: "2026/27", isa_used: 16_000 },
        { profile_id: "p2", tax_year: "2026/27", isa_used: 0 },
      ],
      now: LATE_YEAR,
    });
    expect(tracker.asymmetry).not.toBeNull();
    expect(tracker.asymmetry?.heavy.person).toBe("Omar");
    expect(tracker.asymmetry?.light.person).toBe("Haya");
    expect(tracker.asymmetry?.unusedBase).toBe(20_000);
    expect(tracker.asymmetry?.question).toMatch(/expires on 5 April/);
    expect(tracker.asymmetry?.question).toMatch(/account holder's allowance/);
  });

  it("stays quiet when both allowances are being used", () => {
    const tracker = buildIsaTracker({
      members: MEMBERS,
      allowances: [
        { profile_id: "p1", tax_year: "2026/27", isa_used: 16_000 },
        { profile_id: "p2", tax_year: "2026/27", isa_used: 9_000 },
      ],
      now: LATE_YEAR,
    });
    expect(tracker.asymmetry).toBeNull();
  });

  it("stays quiet in a one-person household — there is no second allowance to lose", () => {
    const tracker = buildIsaTracker({
      members: [{ id: "p1", name: "Omar" }],
      allowances: [{ profile_id: "p1", tax_year: "2026/27", isa_used: 20_000 }],
      now: LATE_YEAR,
    });
    expect(tracker.asymmetry).toBeNull();
    expect(tracker.householdCapacityBase).toBe(20_000);
  });

  it("nudges an unfilled allowance in the last sixty days and leaves a filled one alone", () => {
    const late = buildIsaTracker({
      members: MEMBERS,
      allowances: [
        { profile_id: "p1", tax_year: "2026/27", isa_used: 5_000 },
        { profile_id: "p2", tax_year: "2026/27", isa_used: 20_000 },
      ],
      now: LATE_YEAR,
    });
    expect(late.people.find((p) => p.profileId === "p1")?.status).toBe("watch");
    expect(late.people.find((p) => p.profileId === "p2")?.status).toBe("ok");

    const early = buildIsaTracker({
      members: MEMBERS,
      allowances: [{ profile_id: "p1", tax_year: "2026/27", isa_used: 5_000 }],
      now: MID_YEAR,
    });
    expect(early.people.find((p) => p.profileId === "p1")?.status).toBe("ok");
  });

  it("calls an oversubscription a breach and never reports negative headroom", () => {
    const tracker = buildIsaTracker({
      members: MEMBERS,
      allowances: [{ profile_id: "p1", tax_year: "2026/27", isa_used: 22_000 }],
      now: MID_YEAR,
    });
    const omar = tracker.people.find((person) => person.profileId === "p1");
    expect(omar?.status).toBe("breach");
    expect(omar?.remainingBase).toBe(0);
    expect(omar?.usedPct).toBeCloseTo(110, 6);
  });

  it("offers observed ISA credits as a cross-check without folding them into the recorded figure", () => {
    const tracker = buildIsaTracker({
      members: MEMBERS,
      allowances: [{ profile_id: "p1", tax_year: "2026/27", isa_used: 4_000 }],
      observed: { p1: { amount: 12_000, accounts: ["Stocks & Shares ISA"] } },
      now: MID_YEAR,
    });
    const omar = tracker.people.find((person) => person.profileId === "p1");
    expect(omar?.usedBase).toBe(4_000);
    expect(omar?.observedCreditsBase).toBe(12_000);
    expect(omar?.observedAccounts).toEqual(["Stocks & Shares ISA"]);
    expect(tracker.people.find((p) => p.profileId === "p2")?.observedCreditsBase).toBeNull();
  });
});
