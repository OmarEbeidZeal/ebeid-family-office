import { describe, expect, it } from "vitest";
import {
  busyRefusal,
  cachePathOf,
  emptyCounts,
  isCacheObject,
  isEmptySnapshot,
  orphanObjects,
  PROTECTED_TABLES,
  reprocessSummary,
  statementResetPatch,
  subjectOf,
} from "./reprocess";

describe("reading everything again", () => {
  it("refuses while a reader is still working", () => {
    expect(busyRefusal(1, 0)).toMatch(/being read right now/);
    expect(busyRefusal(3, 0)).toMatch(/^3 statements/);
    expect(busyRefusal(0, 2)).toMatch(/locked/);
    expect(busyRefusal(0, 0)).toBeNull();
  });

  it("keeps the file, the account and the fingerprint, and clears every conclusion", () => {
    const patch = statementResetPatch();
    expect(patch).not.toHaveProperty("account_id");
    expect(patch).not.toHaveProperty("proposal_id");
    expect(patch).not.toHaveProperty("file_hash");
    expect(patch).not.toHaveProperty("file_path");
    expect(patch["status"]).toBe("queued");
    expect(patch["attempts"]).toBe(0);
    for (const field of [
      "detected_institution",
      "detected_holder",
      "detected_last4",
      "detected_account_type",
      "match_confidence",
      "match_reason",
      "period_start",
      "period_end",
      "opening_balance",
      "closing_balance",
      "discrepancy",
      "transaction_count",
      "summary",
      "error_message",
    ]) {
      expect(patch[field]).toBeNull();
    }
  });

  it("never lists anything the household typed as deletable", () => {
    for (const table of ["assets", "liabilities", "goals", "income_streams", "categories", "profiles"]) {
      expect(PROTECTED_TABLES).toContain(table);
    }
  });

  it("recognises a snapshot of an empty household", () => {
    expect(isEmptySnapshot({ total_assets: 0, total_liabilities: 0, breakdown: {} })).toBe(true);
    expect(isEmptySnapshot({ total_assets: "0", total_liabilities: "0", breakdown: null })).toBe(true);
    expect(isEmptySnapshot({ total_assets: 0, total_liabilities: 0, breakdown: { cash: 12 } })).toBe(false);
    expect(isEmptySnapshot({ total_assets: 1200, total_liabilities: 0, breakdown: {} })).toBe(false);
  });

  it("finds the cached reading beside each file", () => {
    expect(cachePathOf("hh/monzo.csv")).toBe("hh/monzo.csv.extract.json");
    expect(isCacheObject("hh/monzo.csv.extract.json")).toBe(true);
    expect(isCacheObject("hh/monzo.csv")).toBe(false);
    expect(subjectOf("hh/monzo.csv.extract.json")).toBe("hh/monzo.csv");
    expect(subjectOf("hh/monzo.csv")).toBe("hh/monzo.csv");
  });

  it("treats files no row points at as strays, including a leftover fixture", () => {
    const orphans = orphanObjects(
      [
        "hh/monzo.csv",
        "hh/monzo.csv.extract.json",
        "hh/monzo-fixture.csv",
        "hh/monzo-fixture.csv.extract.json",
      ],
      ["hh/monzo.csv"],
    );
    expect(orphans).toEqual(["hh/monzo-fixture.csv", "hh/monzo-fixture.csv.extract.json"]);
  });

  it("writes one line naming what went", () => {
    const counts = { ...emptyCounts(), requeued: 12, transactions: 2052, orphanObjects: 4 };
    const line = reprocessSummary(counts);
    expect(line).toContain("12 statements back in the queue");
    expect(line).toContain("2052 transactions");
    expect(line).toContain("4 stray files");
  });
});
