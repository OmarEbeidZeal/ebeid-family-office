import { describe, expect, it } from "vitest";
import {
  evaluateMandate,
  mandateFor,
  mandateSummary,
  normaliseShariahStatus,
  splitConstraints,
  toMandateSleeve,
  trimTrigger,
  worstStatus,
  type MandatePosition,
  type MandateRowLike,
} from "@/lib/mandates";

const row = (over: Partial<MandateRowLike> = {}): MandateRowLike => ({
  id: "m1",
  profile_id: "p1",
  mandate_type: "conventional",
  target_core_pct: 60,
  target_income_pct: 15,
  target_thematic_pct: 15,
  target_satellite_pct: 10,
  speculative_cap_pct: 10,
  single_name_cap_pct: 3,
  crypto_cap_pct: 5,
  additional_constraints: null,
  notes: null,
  ...over,
});

const position = (over: Partial<MandatePosition> = {}): MandatePosition => ({
  id: over.id ?? "h1",
  ticker: over.ticker ?? "VWRP",
  name: over.name ?? null,
  sleeve: over.sleeve ?? "core",
  securityType: over.securityType ?? "etf",
  priced: over.priced ?? true,
  marketValueBase: over.marketValueBase ?? 0,
  shariahStatus: over.shariahStatus ?? "unscreened",
});

describe("mandateFor", () => {
  it("marks a member with nothing on file as unrecorded rather than conventional by default", () => {
    const mandate = mandateFor({ profileId: "p2", person: "Haya" });
    expect(mandate.recorded).toBe(false);
    expect(mandate.type).toBe("conventional");
    expect(mandate.targets.core).toBe(60);
    expect(mandate.id).toBeNull();
  });

  it("reads a Shariah row as a Shariah mandate with no speculative sleeve", () => {
    const mandate = mandateFor({
      profileId: "p2",
      person: "Haya",
      row: row({
        profile_id: "p2",
        mandate_type: "shariah",
        target_core_pct: 100,
        target_income_pct: 0,
        target_thematic_pct: 0,
        target_satellite_pct: 0,
        speculative_cap_pct: 0,
        single_name_cap_pct: 0,
        crypto_cap_pct: 0,
      }),
    });
    expect(mandate.recorded).toBe(true);
    expect(mandate.type).toBe("shariah");
    expect(mandate.speculativeCapPct).toBe(0);
    expect(mandate.targets).toEqual({ core: 100, income: 0, thematic: 0, satellite: 0 });
  });

  it("falls back to the preset constraints where the row records none", () => {
    const shariah = mandateFor({
      profileId: "p2",
      person: "Haya",
      row: row({ mandate_type: "shariah" }),
    });
    expect(shariah.constraints.join(" ")).toMatch(/no conventional bonds or gilts/i);
  });

  it("tolerates numeric columns arriving as strings from the database", () => {
    const mandate = mandateFor({
      profileId: "p1",
      person: "Omar",
      row: row({ target_core_pct: "55", speculative_cap_pct: "12" }),
    });
    expect(mandate.targets.core).toBe(55);
    expect(mandate.speculativeCapPct).toBe(12);
  });
});

describe("helpers", () => {
  it("maps stored sleeves onto the four a mandate targets", () => {
    expect(toMandateSleeve("bond")).toBe("income");
    expect(toMandateSleeve("crypto")).toBe("satellite");
    expect(toMandateSleeve("core")).toBe("core");
  });

  it("treats an unknown compliance value as unscreened, never as compliant", () => {
    expect(normaliseShariahStatus(null)).toBe("unscreened");
    expect(normaliseShariahStatus("yes")).toBe("unscreened");
    expect(normaliseShariahStatus("compliant")).toBe("compliant");
  });

  it("splits written constraints and strips list markers", () => {
    expect(splitConstraints("- No gilts\n• No conventional bonds\n\n")).toEqual([
      "No gilts",
      "No conventional bonds",
    ]);
    expect(splitConstraints(null)).toEqual([]);
  });

  it("puts the trim trigger a point above the cap, and keeps a zero cap a prohibition", () => {
    expect(trimTrigger(3)).toBe(4);
    expect(trimTrigger(0)).toBe(0);
  });

  it("rolls a set of statuses up to the worst one, never an average", () => {
    expect(worstStatus(["ok", "breach", "watch"])).toBe("breach");
    expect(worstStatus(["ok", "unknown"])).toBe("unknown");
    expect(worstStatus([])).toBe("not_applicable");
  });

  it("summarises a mandate in one line", () => {
    const shariah = mandateFor({
      profileId: "p2",
      person: "Haya",
      row: row({
        mandate_type: "shariah",
        target_core_pct: 100,
        target_income_pct: 0,
        target_thematic_pct: 0,
        target_satellite_pct: 0,
        speculative_cap_pct: 0,
      }),
    });
    expect(mandateSummary(shariah)).toBe(
      "Shariah: Core equity 100%. no speculative sleeve, no crypto.",
    );
  });
});

describe("evaluateMandate", () => {
  const conventional = mandateFor({ profileId: "p1", person: "Omar", row: row() });

  it("measures each sleeve against the person's own investable assets", () => {
    const evaluation = evaluateMandate({
      mandate: conventional,
      investableBase: 100_000,
      positions: [
        position({ id: "a", ticker: "VWRP", sleeve: "core", marketValueBase: 63_000 }),
        position({ id: "b", ticker: "IGLT", sleeve: "bond", marketValueBase: 15_000 }),
        position({ id: "c", ticker: "IWDA", sleeve: "thematic", marketValueBase: 15_000 }),
        position({ id: "d", ticker: "LUNR", sleeve: "satellite", marketValueBase: 1_750 }),
        position({ id: "e", ticker: "CRWV", sleeve: "satellite", marketValueBase: 1_750 }),
        position({ id: "f", ticker: "RKLB", sleeve: "satellite", marketValueBase: 1_750 }),
        position({ id: "g", ticker: "ASTS", sleeve: "satellite", marketValueBase: 1_750 }),
      ],
    });
    expect(evaluation.rows.find((r) => r.sleeve === "core")?.actualPct).toBe(63);
    expect(evaluation.rows.find((r) => r.sleeve === "income")?.actualPct).toBe(15);
    expect(evaluation.rows.find((r) => r.sleeve === "core")?.driftPp).toBe(3);
    expect(evaluation.allocationStatus).toBe("ok");
    expect(evaluation.speculative.pct).toBeCloseTo(7, 6);
    expect(evaluation.speculativeStatus).toBe("ok");
    expect(evaluation.largestSingleNamePct).toBeCloseTo(1.75, 6);
    expect(evaluation.compliance.status).toBe("not_applicable");
  });


  it("refuses to report weights while a holding has no price", () => {
    const evaluation = evaluateMandate({
      mandate: conventional,
      investableBase: 50_000,
      positions: [
        position({ id: "a", sleeve: "core", marketValueBase: 30_000 }),
        position({ id: "b", ticker: "PRIV", sleeve: "core", priced: false, marketValueBase: null }),
      ],
    });
    expect(evaluation.measurable).toBe(false);
    expect(evaluation.allocationStatus).toBe("unknown");
    expect(evaluation.worstDriftPp).toBeNull();
    expect(evaluation.allocationHeadline).toMatch(/no price/);
  });

  it("says there is nothing to measure when the person holds no investable assets", () => {
    const evaluation = evaluateMandate({
      mandate: conventional,
      investableBase: 0,
      positions: [],
    });
    expect(evaluation.allocationStatus).toBe("not_applicable");
    expect(evaluation.speculativeStatus).toBe("not_applicable");
    expect(evaluation.allocationHeadline).toMatch(/no liquid investable assets/);
  });

  it("flags drift past five points as a watch, not a breach", () => {
    const evaluation = evaluateMandate({
      mandate: conventional,
      investableBase: 100_000,
      positions: [position({ id: "a", sleeve: "core", marketValueBase: 70_000 })],
    });
    // Core is ten points heavy; the empty income sleeve is fifteen points light.
    expect(evaluation.rows.find((r) => r.sleeve === "core")?.driftPp).toBe(10);
    expect(evaluation.worstDriftPp).toBe(-15);
    expect(evaluation.allocationStatus).toBe("watch");
  });


  it("breaches a single name past the trim trigger", () => {
    const evaluation = evaluateMandate({
      mandate: conventional,
      investableBase: 100_000,
      positions: [
        position({ id: "a", sleeve: "core", marketValueBase: 55_000 }),
        position({ id: "b", ticker: "LUNR", sleeve: "satellite", marketValueBase: 5_000 }),
      ],
    });
    expect(evaluation.largestSingleNamePct).toBe(5);
    expect(evaluation.singleNames[0]?.status).toBe("breach");
    expect(evaluation.speculativeStatus).toBe("breach");
  });

  describe("a Shariah mandate", () => {
    const shariah = mandateFor({
      profileId: "p2",
      person: "Haya",
      row: row({
        profile_id: "p2",
        mandate_type: "shariah",
        target_core_pct: 100,
        target_income_pct: 0,
        target_thematic_pct: 0,
        target_satellite_pct: 0,
        speculative_cap_pct: 0,
        single_name_cap_pct: 0,
        crypto_cap_pct: 0,
      }),
    });

    it("passes when the whole book is one screened compliant holding", () => {
      const evaluation = evaluateMandate({
        mandate: shariah,
        investableBase: 40_000,
        positions: [
          position({
            id: "s1",
            ticker: "ISDU",
            sleeve: "core",
            marketValueBase: 40_000,
            shariahStatus: "compliant",
          }),
        ],
      });
      expect(evaluation.allocationStatus).toBe("ok");
      expect(evaluation.compliance.status).toBe("ok");
      expect(evaluation.compliance.headline).toMatch(/recorded as Shariah-compliant/);
    });

    it("reports an unscreened holding as unknown rather than compliant", () => {
      const evaluation = evaluateMandate({
        mandate: shariah,
        investableBase: 40_000,
        positions: [
          position({ id: "s1", ticker: "ISDU", sleeve: "core", marketValueBase: 40_000 }),
        ],
      });
      expect(evaluation.compliance.status).toBe("unknown");
      expect(evaluation.compliance.unscreened.map((entry) => entry.ticker)).toEqual(["ISDU"]);
      expect(evaluation.compliance.headline).toMatch(/not the same as compliant/);
    });

    it("breaches on a holding recorded as not compliant", () => {
      const evaluation = evaluateMandate({
        mandate: shariah,
        investableBase: 40_000,
        positions: [
          position({
            id: "s1",
            ticker: "ISDU",
            sleeve: "core",
            marketValueBase: 30_000,
            shariahStatus: "compliant",
          }),
          position({
            id: "s2",
            ticker: "IGLT",
            sleeve: "bond",
            marketValueBase: 10_000,
            shariahStatus: "non_compliant",
          }),
        ],
      });
      expect(evaluation.compliance.status).toBe("breach");
      expect(evaluation.compliance.nonCompliant.map((entry) => entry.ticker)).toEqual(["IGLT"]);
      // A zero income target is a prohibition, so anything held there breaches.
      expect(evaluation.rows.find((r) => r.sleeve === "income")?.status).toBe("breach");
      expect(evaluation.allocationStatus).toBe("breach");
    });

    it("treats a zero speculative cap as a prohibition, not a limit to creep up on", () => {
      const evaluation = evaluateMandate({
        mandate: shariah,
        investableBase: 40_000,
        positions: [
          position({
            id: "s1",
            ticker: "ISDU",
            sleeve: "core",
            marketValueBase: 38_000,
            shariahStatus: "compliant",
          }),
          position({
            id: "s2",
            ticker: "LUNR",
            sleeve: "satellite",
            marketValueBase: 2_000,
            shariahStatus: "compliant",
          }),
        ],
      });
      expect(evaluation.speculativeStatus).toBe("breach");
      expect(evaluation.speculativeHeadline).toMatch(/holds no speculative sleeve, yet/);
    });

    it("never screens a conventional mandate's holdings", () => {
      const evaluation = evaluateMandate({
        mandate: mandateFor({ profileId: "p1", person: "Omar", row: row() }),
        investableBase: 10_000,
        positions: [
          position({ id: "a", sleeve: "core", marketValueBase: 6_000 }),
          position({ id: "b", ticker: "IGLT", sleeve: "bond", marketValueBase: 4_000 }),
        ],
      });
      expect(evaluation.compliance.status).toBe("not_applicable");
      expect(evaluation.compliance.unscreened).toEqual([]);
      expect(evaluation.findings.some((f) => f.label === "Shariah compliance")).toBe(false);
    });
  });
});
