import { describe, expect, it } from "vitest";

import { babyKeyDates, babyTaskTemplate } from "./baby-plan";
import {
  childcareAnnual,
  childcareSchedule,
  fundedHoursStart,
  supportAtRisk,
  unfundedWindow,
  type ChildcarePlan,
} from "./childcare";
import { addMonths, nextTermStart, startOfStatutoryWeek } from "./dates";
import {
  leaveMonthlyIncome,
  leaveSchedule,
  statutoryWeeklyPay,
  summariseLeave,
  type LeavePlan,
} from "./parental-leave";
import {
  adjustedNetIncome,
  assessChildBenefit,
  assessCliff,
  personalAllowanceAt,
} from "./thresholds";
import { STATUTORY_WEEKLY_CAP } from "./uk-2026";

const DUE = "2027-03-20";

const smpPlan = (overrides: Partial<LeavePlan> = {}): LeavePlan => ({
  scheme: "smp",
  leaveStartDate: "2027-03-01",
  leaveWeeks: 52,
  averageWeeklyEarnings: 1_000,
  employerEnhanced: false,
  enhancedFullPayWeeks: 0,
  enhancedHalfPayWeeks: 0,
  ...overrides,
});

describe("statutory maternity pay", () => {
  it("pays 90% of earnings, uncapped, for the first six weeks", () => {
    const plan = smpPlan();
    for (let week = 1; week <= 6; week += 1) {
      expect(statutoryWeeklyPay(plan, week)).toBeCloseTo(900, 2);
    }
  });

  it("drops to the flat rate at week seven", () => {
    const plan = smpPlan();
    expect(statutoryWeeklyPay(plan, 7)).toBeCloseTo(STATUTORY_WEEKLY_CAP, 2);
    expect(statutoryWeeklyPay(plan, 39)).toBeCloseTo(STATUTORY_WEEKLY_CAP, 2);
  });

  it("pays nothing from week forty", () => {
    const plan = smpPlan();
    expect(statutoryWeeklyPay(plan, 40)).toBe(0);
    expect(statutoryWeeklyPay(plan, 52)).toBe(0);
  });

  it("uses 90% of earnings when that is below the cap", () => {
    const plan = smpPlan({ averageWeeklyEarnings: 200 });
    expect(statutoryWeeklyPay(plan, 7)).toBeCloseTo(180, 2);
  });

  it("pays Maternity Allowance flat from week one for 39 weeks", () => {
    const plan = smpPlan({ scheme: "maternity_allowance" });
    expect(statutoryWeeklyPay(plan, 1)).toBeCloseTo(STATUTORY_WEEKLY_CAP, 2);
    expect(statutoryWeeklyPay(plan, 39)).toBeCloseTo(STATUTORY_WEEKLY_CAP, 2);
    expect(statutoryWeeklyPay(plan, 40)).toBe(0);
  });

  it("pays paternity for two weeks only", () => {
    const plan = smpPlan({ scheme: "paternity", leaveWeeks: 2 });
    expect(statutoryWeeklyPay(plan, 2)).toBeCloseTo(STATUTORY_WEEKLY_CAP, 2);
    expect(statutoryWeeklyPay(plan, 3)).toBe(0);
  });
});

describe("leave schedule", () => {
  it("marks the week pay drops and the week it stops", () => {
    const summary = summariseLeave(smpPlan(), 4_333);
    expect(summary.firstDrop?.week).toBe(7);
    expect(summary.unpaidFromWeek).toBe(40);
  });

  it("tops up to full pay during an employer's enhanced weeks", () => {
    const rows = leaveSchedule(
      smpPlan({ employerEnhanced: true, enhancedFullPayWeeks: 26, enhancedHalfPayWeeks: 13 }),
    );
    expect(rows[0]!.total).toBeCloseTo(1_000, 2);
    expect(rows[25]!.total).toBeCloseTo(1_000, 2);
    // Half pay plus the statutory element, capped at full pay.
    expect(rows[26]!.total).toBeCloseTo(500 + STATUTORY_WEEKLY_CAP, 2);
    expect(rows[39]!.total).toBe(0);
  });

  it("never pays more than full pay while enhanced", () => {
    const rows = leaveSchedule(
      smpPlan({ employerEnhanced: true, enhancedFullPayWeeks: 0, enhancedHalfPayWeeks: 52 }),
    );
    for (const row of rows) expect(row.total).toBeLessThanOrEqual(1_000.001);
  });

  it("blends salary and leave pay across a part month", () => {
    const months = leaveMonthlyIncome(smpPlan({ leaveStartDate: "2027-03-20" }), 4_333);
    const march = months.find((month) => month.monthKey === "2027-03")!;
    // Nineteen days of salary, twelve of maternity pay.
    expect(march.received).toBeGreaterThan(4_333 * 0.6);
    expect(march.received).toBeLessThan(4_333);
  });

  it("returns a shortfall against normal pay over the whole leave", () => {
    const summary = summariseLeave(smpPlan(), 4_333);
    expect(summary.shortfall).toBeGreaterThan(0);
    expect(summary.totalReceived).toBeLessThan(summary.totalNormal);
    expect(summary.returnDate).toBe("2028-02-28");
  });

  it("has no schedule without a start date", () => {
    expect(leaveSchedule(smpPlan({ leaveStartDate: "" }))).toEqual([]);
  });
});

describe("funded childcare timing", () => {
  it("starts the term after the child turns nine months", () => {
    // Born 20 March 2027, nine months on 20 December 2027, funded from January.
    expect(fundedHoursStart(DUE)).toBe("2028-01-01");
  });

  it("uses the September term for a baby born in November", () => {
    expect(fundedHoursStart("2027-11-10")).toBe("2028-09-01");
  });

  it("uses the April term for a baby born in June", () => {
    expect(fundedHoursStart("2027-06-01")).toBe("2028-04-01");
  });

  it("treats a term-boundary birthday as that term", () => {
    expect(nextTermStart("2028-01-01")).toBe("2028-01-01");
    expect(addMonths("2027-05-31", 9)).toBe("2028-02-29");
  });
});

const nursery: ChildcarePlan = {
  startDate: "2028-03-01",
  hoursPerWeek: 40,
  hourlyRate: 10,
  weeksPerYear: 51,
  monthlyExtras: 100,
  usesTaxFreeChildcare: true,
};

describe("childcare cost", () => {
  it("bills the full rate with no help", () => {
    const annual = childcareAnnual(nursery, false);
    expect(annual.gross).toBeCloseTo(40 * 10 * 51 + 1_200, 2);
    expect(annual.funded).toBe(0);
    expect(annual.taxFree).toBe(0);
    expect(annual.net).toBeCloseTo(annual.gross, 2);
  });

  it("applies 30 hours over 38 weeks and caps the top-up at £2,000", () => {
    const annual = childcareAnnual(nursery, true);
    expect(annual.funded).toBeCloseTo(30 * 10 * 38, 2);
    expect(annual.taxFree).toBe(2_000);
    expect(annual.net).toBeCloseTo(annual.gross - annual.funded - 2_000, 2);
  });

  it("prices the help that going over £100,000 destroys", () => {
    const risk = supportAtRisk(nursery);
    expect(risk.funded).toBeCloseTo(11_400, 2);
    expect(risk.taxFree).toBe(2_000);
    expect(risk.total).toBeCloseTo(13_400, 2);
  });

  it("charges the full rate until funding starts, then steps down", () => {
    const rows = childcareSchedule({
      plan: nursery,
      dueDate: DUE,
      eligible: true,
      months: 24,
      fromMonthKey: "2027-04",
    });
    expect(rows[0]!.monthKey).toBe("2028-03");
    // Funding began in January, before nursery started, so every month is funded.
    expect(rows.every((row) => row.fundedActive)).toBe(true);

    const early = childcareSchedule({
      plan: { ...nursery, startDate: "2027-10-01" },
      dueDate: DUE,
      eligible: true,
      months: 24,
      fromMonthKey: "2027-04",
    });
    expect(early[0]!.fundedActive).toBe(false);
    expect(early.find((row) => row.monthKey === "2028-01")!.fundedActive).toBe(true);
    expect(early[0]!.net).toBeGreaterThan(
      early.find((row) => row.monthKey === "2028-01")!.net,
    );
  });

  it("measures the gap between nursery starting and funding arriving", () => {
    const window = unfundedWindow({ ...nursery, startDate: "2027-10-01" }, DUE, true);
    expect(window?.months).toBe(3);
    expect(window?.fundedFrom).toBe("2028-01");
    expect(window?.total).toBeGreaterThan(0);
  });

  it("reports no gap when nursery starts after funding", () => {
    expect(unfundedWindow(nursery, DUE, true)).toBeNull();
  });
});

describe("the £100,000 cliff", () => {
  it("takes pension contributions and grossed-up Gift Aid off gross pay", () => {
    const ani = adjustedNetIncome({
      grossSalary: 110_000,
      bonus: 10_000,
      pensionContributions: 8_000,
      otherTaxableIncome: 2_000,
      giftAid: 800,
    });
    expect(ani).toBeCloseTo(122_000 - 8_000 - 1_000, 2);
  });

  it("tapers the personal allowance at £1 in every £2", () => {
    expect(personalAllowanceAt(99_000)).toBe(12_570);
    expect(personalAllowanceAt(110_000)).toBe(12_570 - 5_000);
    expect(personalAllowanceAt(130_000)).toBe(0);
  });

  it("is clear below the line", () => {
    const assessment = assessCliff(82_000, 13_400);
    expect(assessment.status).toBe("clear");
    expect(assessment.contributionToClear).toBe(0);
    expect(assessment.headroom).toBe(18_000);
  });

  it("warns within £10,000 of the line", () => {
    expect(assessCliff(96_000, 13_400).status).toBe("close");
  });

  it("prices the contribution that gets back under, and what it buys", () => {
    const assessment = assessCliff(108_000, 13_400);
    expect(assessment.status).toBe("over");
    expect(assessment.contributionToClear).toBe(8_000);
    // 40% relief plus the restored allowance taxed at 40% — a 60% marginal rate.
    expect(assessment.taxSaved).toBeCloseTo(8_000 * 0.6, 2);
    expect(assessment.supportRecovered).toBe(13_400);
    expect(assessment.effectiveReturn).toBeGreaterThan(2);
  });
});

describe("child benefit", () => {
  it("pays the first child rate, and less for each after", () => {
    expect(assessChildBenefit(1, 50_000).weekly).toBeCloseTo(27.05, 2);
    expect(assessChildBenefit(2, 50_000).weekly).toBeCloseTo(27.05 + 17.9, 2);
  });

  it("keeps the whole award below £60,000", () => {
    const assessment = assessChildBenefit(1, 59_000);
    expect(assessment.charge).toBe(0);
    expect(assessment.retained).toBeCloseTo(27.05 * 52, 2);
  });

  it("halves the award in the middle of the taper", () => {
    const assessment = assessChildBenefit(1, 70_000);
    expect(assessment.chargeRate).toBeCloseTo(0.5, 6);
    expect(assessment.retained).toBeCloseTo(assessment.annual / 2, 2);
  });

  it("claws all of it back above £80,000", () => {
    const assessment = assessChildBenefit(1, 95_000);
    expect(assessment.fullyClawedBack).toBe(true);
    expect(assessment.retained).toBeCloseTo(0, 6);
  });
});

describe("key dates", () => {
  it("derives the whole timeline from the due date", () => {
    const dates = babyKeyDates(DUE, "2028-03-01");
    // The expected week of childbirth runs Sunday to Saturday.
    expect(startOfStatutoryWeek(DUE)).toBe("2027-03-14");
    expect(dates.qualifyingWeek).toBe("2026-11-29");
    // Fifteen weeks before that week, ending on its Saturday.
    expect(dates.notifyEmployerBy).toBe("2026-12-05");
    expect(dates.earliestLeaveStart).toBe("2026-12-27");
    expect(dates.registerBirthBy).toBe("2027-05-01");
    expect(dates.claimChildBenefitBy).toBe("2027-06-20");
    expect(dates.ninthMonth).toBe("2027-12-20");
    expect(dates.fundedHoursApplyBy).toBe("2027-12-31");
    expect(dates.fundedHoursStart).toBe("2028-01-01");
    expect(dates.taxYearEnd).toBe("2027-04-05");
  });

  it("orders the task list by date and flags the deadlines that cost money", () => {
    const tasks = babyTaskTemplate(DUE, "2028-03-01");
    const dates = tasks.map((task) => task.dueDate);
    expect([...dates].sort()).toEqual(dates);
    const hard = tasks.filter((task) => task.hard).map((task) => task.key);
    expect(hard).toContain("notify-employer");
    expect(hard).toContain("funded-hours-apply");
    expect(hard).toContain("child-benefit");
  });

  it("leaves nursery dates out when there is no nursery date yet", () => {
    const tasks = babyTaskTemplate(DUE, null);
    expect(tasks.some((task) => task.key === "nursery-start")).toBe(false);
    expect(tasks.some((task) => task.key === "funded-hours-start")).toBe(true);
  });
});
