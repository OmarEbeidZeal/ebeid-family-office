/**
 * The paperwork arithmetic, tested where getting it wrong would cost money:
 * the notice date a household must act on, cover against need, and adjusted net
 * income against £100,000 — where salary sacrifice is the single commonest way
 * the figure comes out wrong by the whole contribution.
 */
import { describe, expect, it } from "vitest";
import {
  ANI_CLIFF,
  coverByPerson,
  estimateAni,
  noticeWindow,
  payslipCoverage,
  pensionAllowance,
  protectionGap,
  rentPerMonth,
  rentTrajectory,
  taxCodeIssues,
  taxYearOf,
  tenancyStatusOn,
  upcomingRenewals,
  type PayslipLike,
  type PolicyLike,
} from "./analysis";

/* ------------------------------------------------------------- fixtures */

const policy = (over: Partial<PolicyLike> & Pick<PolicyLike, "id" | "policy_type">): PolicyLike => ({
  insurer: "Insurer",
  insured_person: null,
  owner_profile_id: null,
  sum_assured: null,
  benefit_amount: null,
  benefit_frequency: null,
  premium_amount: null,
  premium_frequency: "monthly",
  currency: "GBP",
  start_date: null,
  end_date: null,
  renewal_date: null,
  in_trust: null,
  status: "active",
  ...over,
});

const slip = (over: Partial<PayslipLike> & Pick<PayslipLike, "id" | "pay_date">): PayslipLike => ({
  profile_id: "omar",
  employer: "Zeal",
  employee_name: "Omar Ebeid",
  pay_frequency: "monthly",
  tax_year: null,
  tax_code: "1257L",
  currency: "GBP",
  gross_pay: null,
  net_pay: null,
  income_tax: null,
  national_insurance: null,
  employee_pension: null,
  employer_pension: null,
  salary_sacrifice: false,
  benefits_in_kind: null,
  ytd_gross: null,
  ytd_employee_pension: null,
  ytd_employer_pension: null,
  ytd_benefits_in_kind: null,
  ytd_net_pay: null,
  reconciliation: "unchecked",
  reconciliation_delta: null,
  ...over,
});

/* ----------------------------------------------------------------- rent */

describe("rent frequency", () => {
  it("puts every frequency on the same monthly footing", () => {
    expect(rentPerMonth(600, "weekly")).toBeCloseTo(2600, 6);
    expect(rentPerMonth(1200, "fortnightly")).toBeCloseTo(2600, 6);
    expect(rentPerMonth(2600, "monthly")).toBe(2600);
    expect(rentPerMonth(7800, "quarterly")).toBe(2600);
    expect(rentPerMonth(31_200, "annual")).toBe(2600);
  });
});

describe("tenancy status", () => {
  it("reads the calendar, not the paperwork's intent", () => {
    expect(tenancyStatusOn("2027-01-01", "2028-01-01", "2026-06-01")).toBe("upcoming");
    expect(tenancyStatusOn("2025-01-01", "2026-12-31", "2026-06-01")).toBe("current");
    expect(tenancyStatusOn("2024-01-01", "2025-12-31", "2026-06-01")).toBe("ended");
    // No end date on the agreement means it is still running.
    expect(tenancyStatusOn("2024-01-01", null, "2026-06-01")).toBe("current");
  });
});

describe("notice window", () => {
  it("puts the decision at the notice date, not the term end", () => {
    const window = noticeWindow(
      { term_end: "2027-06-30", break_clause_date: null, notice_period_months: 2 },
      "2026-09-01",
    );
    expect(window.lastNoticeDate).toBe("2027-04-30");
    expect(window.decisionDate).toBe("2027-04-30");
    expect(window.decisionLabel).toBe("notice to end at the term end");
    expect(window.daysToDecision).toBeGreaterThan(0);
  });

  it("prefers a break clause when its notice date comes first", () => {
    const window = noticeWindow(
      { term_end: "2028-01-31", break_clause_date: "2027-01-31", notice_period_months: 2 },
      "2026-09-01",
    );
    expect(window.breakNoticeDate).toBe("2026-11-30");
    expect(window.decisionDate).toBe("2026-11-30");
    expect(window.decisionLabel).toBe("notice to use the break clause");
  });

  it("keeps a passed decision visible rather than pretending there is none", () => {
    const window = noticeWindow(
      { term_end: "2026-06-30", break_clause_date: null, notice_period_months: 2 },
      "2026-09-01",
    );
    expect(window.decisionDate).toBe("2026-04-30");
    expect(window.daysToDecision).toBeLessThan(0);
  });

  it("has no decision date when the agreement fixes no notice period", () => {
    const window = noticeWindow(
      { term_end: "2027-06-30", break_clause_date: null, notice_period_months: null },
      "2026-09-01",
    );
    expect(window.decisionDate).toBeNull();
    expect(window.daysToDecision).toBeNull();
  });
});

describe("rent trajectory", () => {
  it("prorates a part-year rather than charging twelve months for four", () => {
    const points = rentTrajectory(
      [
        {
          property_address: "12 Cadogan Gardens",
          role: "tenant",
          rent_amount: 3000,
          rent_frequency: "monthly",
          currency: "GBP",
          term_start: "2025-09-01",
          term_end: "2026-08-31",
        },
      ],
      "2026-06-30",
    );

    expect(points.map((point) => point.year)).toEqual([2025, 2026]);
    expect(points[0]!.months).toBeCloseTo(4, 0);
    expect(points[0]!.paid).toBeCloseTo(12_000, -2);
    // Only counted to the given date: rent not yet paid is not rent paid.
    expect(points[1]!.months).toBeCloseTo(6, 0);
    const total = points.reduce((sum, point) => sum + point.paid, 0);
    expect(total).toBeCloseTo(30_000, -3);
  });

  it("takes the headline rate from the agreement that started most recently", () => {
    const points = rentTrajectory(
      [
        {
          property_address: "Old flat",
          role: "tenant",
          rent_amount: 2000,
          rent_frequency: "monthly",
          currency: "GBP",
          term_start: "2025-01-01",
          term_end: "2025-06-30",
        },
        {
          property_address: "New flat",
          role: "tenant",
          rent_amount: 3200,
          rent_frequency: "monthly",
          currency: "GBP",
          term_start: "2025-07-01",
          term_end: "2025-12-31",
        },
      ],
      "2026-01-31",
    );

    expect(points).toHaveLength(1);
    expect(points[0]!.monthly).toBe(3200);
    expect(points[0]!.address).toBe("New flat");
    expect(points[0]!.months).toBeCloseTo(12, 0);
    expect(points[0]!.paid).toBeCloseTo(31_200, -3);
  });

  it("ignores a landlord agreement — that is rent in, not rent paid", () => {
    expect(
      rentTrajectory(
        [
          {
            property_address: "Cairo apartment",
            role: "landlord",
            rent_amount: 20_000,
            rent_frequency: "monthly",
            currency: "EGP",
            term_start: "2025-01-01",
            term_end: "2025-12-31",
          },
        ],
        "2026-01-31",
      ),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------ protection */

const people = [
  { id: "omar", name: "Omar", annualIncome: 180_000 },
  { id: "haya", name: "Haya", annualIncome: 60_000 },
];

describe("cover by person", () => {
  it("attributes by profile first and by name only as a fallback", () => {
    const summaries = coverByPerson(
      [
        policy({ id: "1", policy_type: "life", owner_profile_id: "omar", sum_assured: 500_000 }),
        policy({ id: "2", policy_type: "life", insured_person: "Haya Ebeid", sum_assured: 250_000 }),
        policy({
          id: "3",
          policy_type: "income_protection",
          owner_profile_id: "omar",
          benefit_amount: 6_000,
          benefit_frequency: "monthly",
        }),
        // Lapsed cover is not cover.
        policy({
          id: "4",
          policy_type: "life",
          owner_profile_id: "omar",
          sum_assured: 1_000_000,
          status: "lapsed",
        }),
      ],
      people,
    );

    expect(summaries[0]!.lifeCover).toBe(500_000);
    expect(summaries[0]!.incomeProtectionMonthly).toBe(6_000);
    expect(summaries[0]!.hasIncomeProtection).toBe(true);
    expect(summaries[1]!.lifeCover).toBe(250_000);
    expect(summaries[1]!.hasIncomeProtection).toBe(false);
  });
});

describe("protection gap", () => {
  it("measures cover against liabilities plus replacement income", () => {
    const gap = protectionGap({
      policies: [
        policy({ id: "1", policy_type: "life", owner_profile_id: "omar", sum_assured: 750_000 }),
      ],
      people,
      liabilities: 420_000,
      years: 10,
    });

    expect(gap.incomeReplacement).toBe(2_400_000);
    expect(gap.need).toBe(2_820_000);
    expect(gap.cover).toBe(750_000);
    expect(gap.gap).toBe(2_070_000);
    expect(gap.peopleWithoutLifeCover.map((person) => person.name)).toEqual(["Haya"]);
    expect(gap.peopleWithoutIncomeProtection.map((person) => person.name)).toEqual([
      "Omar",
      "Haya",
    ]);
    // Not written in trust, so the payout lands in the estate.
    expect(gap.notInTrust).toHaveLength(1);
  });

  it("never reports a negative gap when cover exceeds the need", () => {
    const gap = protectionGap({
      policies: [
        policy({
          id: "1",
          policy_type: "life",
          owner_profile_id: "omar",
          sum_assured: 5_000_000,
          in_trust: true,
        }),
      ],
      people,
      liabilities: 100_000,
      years: 10,
    });
    expect(gap.gap).toBe(0);
    expect(gap.notInTrust).toEqual([]);
  });
});

describe("renewals", () => {
  it("flags inside 60 days, bands at 30, and ignores the rest", () => {
    const flags = upcomingRenewals(
      [
        policy({ id: "1", policy_type: "home", insurer: "Aviva", renewal_date: "2026-09-20" }),
        policy({ id: "2", policy_type: "car", insurer: "Direct Line", renewal_date: "2026-10-25" }),
        policy({ id: "3", policy_type: "travel", insurer: "Axa", renewal_date: "2027-03-01" }),
        // Already gone.
        policy({ id: "4", policy_type: "pet", insurer: "Petplan", renewal_date: "2026-08-01" }),
      ],
      "2026-09-01",
    );

    expect(flags.map((flag) => flag.policy.id)).toEqual(["1", "2"]);
    expect(flags[0]!.band).toBe(30);
    expect(flags[1]!.band).toBe(60);
  });
});

/* --------------------------------------------------------------- payslips */

describe("tax year", () => {
  it("turns on 6 April", () => {
    expect(taxYearOf("2026-04-05")).toBe("2025/26");
    expect(taxYearOf("2026-04-06")).toBe("2026/27");
    expect(taxYearOf("2027-01-31")).toBe("2026/27");
  });
});

describe("adjusted net income", () => {
  const base = {
    id: "p1",
    pay_date: "2026-09-30",
    tax_year: "2026/27",
    gross_pay: 15_000,
    ytd_gross: 90_000,
    employee_pension: 750,
    ytd_employee_pension: 4_500,
    employer_pension: 900,
    ytd_employer_pension: 5_400,
  };

  it("projects the rest of the year at the current rate and deducts pension", () => {
    const estimate = estimateAni({
      payslips: [slip(base)],
      profileId: "omar",
      name: "Omar",
      taxYear: "2026/27",
    });

    expect(estimate).not.toBeNull();
    expect(estimate!.remaining).toBe(6);
    expect(estimate!.projectedGross).toBe(180_000);
    expect(estimate!.projectedPension).toBe(9_000);
    expect(estimate!.ani).toBe(171_000);
    expect(estimate!.status).toBe("over");
    expect(estimate!.headroom).toBe(ANI_CLIFF - 171_000);
    // Rounded up to the next £100, so the contribution actually clears the line.
    expect(estimate!.contributionToClear).toBe(71_000);
  });

  it("does not deduct a sacrificed contribution twice", () => {
    const sacrificed = estimateAni({
      payslips: [slip({ ...base, salary_sacrifice: true })],
      profileId: "omar",
      name: "Omar",
      taxYear: "2026/27",
    });
    // The gross on the slip is already net of the contribution.
    expect(sacrificed!.ani).toBe(180_000);
    expect(sacrificed!.salarySacrifice).toBe(true);
    expect(sacrificed!.basis.join(" ")).toContain("salary sacrifice");
  });

  it("adds income a payslip never sees and takes Gift Aid off, grossed up", () => {
    const estimate = estimateAni({
      payslips: [slip({ ...base, gross_pay: 7_000, ytd_gross: 42_000 })],
      profileId: "omar",
      name: "Omar",
      taxYear: "2026/27",
      otherIncome: 20_000,
      giftAid: 1_000,
    });

    // 84,000 projected gross − 9,000 pension + 20,000 other − 1,250 grossed-up Gift Aid.
    expect(estimate!.ani).toBe(93_750);
    expect(estimate!.status).toBe("clear");
  });

  it("sums year-to-date across employers without double counting a month", () => {
    const estimate = estimateAni({
      payslips: [
        slip({ ...base, id: "a", pay_date: "2026-08-31", ytd_gross: 75_000 }),
        slip({ ...base, id: "b", pay_date: "2026-09-30", ytd_gross: 90_000 }),
        slip({
          ...base,
          id: "c",
          employer: "Board seat",
          pay_date: "2026-09-30",
          gross_pay: 2_000,
          ytd_gross: 12_000,
          employee_pension: 0,
          ytd_employee_pension: 0,
        }),
      ],
      profileId: "omar",
      name: "Omar",
      taxYear: "2026/27",
    });

    // The later Zeal slip supersedes the earlier one; the board seat adds to it.
    expect(estimate!.ytdGross).toBe(102_000);
    expect(estimate!.employers).toHaveLength(2);
  });

  it("returns nothing when no payslip covers the year, rather than guessing zero", () => {
    expect(
      estimateAni({
        payslips: [slip({ id: "old", pay_date: "2025-09-30", tax_year: "2025/26" })],
        profileId: "omar",
        name: "Omar",
        taxYear: "2026/27",
      }),
    ).toBeNull();
  });
});

describe("pension annual allowance", () => {
  it("projects both sides of the contribution and tapers on adjusted income", () => {
    const estimate = pensionAllowance({
      payslips: [
        slip({
          id: "p1",
          pay_date: "2026-09-30",
          tax_year: "2026/27",
          employee_pension: 2_000,
          ytd_employee_pension: 12_000,
          employer_pension: 3_000,
          ytd_employer_pension: 18_000,
        }),
      ],
      profileId: "omar",
      taxYear: "2026/27",
      ani: 280_000,
    });

    expect(estimate!.projectedTotal).toBe(60_000);
    // Employer contributions are projected to the full year alongside the ANI.
    expect(estimate!.adjustedIncome).toBe(316_000);
    expect(estimate!.taperLikely).toBe(true);
    expect(estimate!.taperedAllowance).toBe(32_000);
    expect(estimate!.headroom).toBe(-28_000);
  });

  it("leaves the allowance whole below the taper threshold", () => {
    const estimate = pensionAllowance({
      payslips: [
        slip({
          id: "p1",
          pay_date: "2026-09-30",
          tax_year: "2026/27",
          employee_pension: 500,
          ytd_employee_pension: 3_000,
          employer_pension: 500,
          ytd_employer_pension: 3_000,
        }),
      ],
      profileId: "omar",
      taxYear: "2026/27",
      ani: 95_000,
    });

    expect(estimate!.taperLikely).toBe(false);
    expect(estimate!.taperedAllowance).toBe(60_000);
    expect(estimate!.headroom).toBe(48_000);
  });
});

describe("tax codes", () => {
  it("names an emergency code on the latest slip", () => {
    const issues = taxCodeIssues([
      slip({ id: "1", pay_date: "2026-08-31", tax_code: "1257L" }),
      slip({ id: "2", pay_date: "2026-09-30", tax_code: "1257L W1" }),
    ]);
    expect(issues.map((issue) => issue.kind)).toEqual(["emergency", "changed"]);
    expect(issues[0]!.since).toBe("2026-09-30");
  });

  it("names a code that gives no personal allowance", () => {
    const issues = taxCodeIssues([slip({ id: "1", pay_date: "2026-09-30", tax_code: "BR" })]);
    expect(issues[0]!.kind).toBe("no_allowance");
  });

  it("says nothing about a steady, ordinary code", () => {
    expect(
      taxCodeIssues([
        slip({ id: "1", pay_date: "2026-08-31", tax_code: "1257L" }),
        slip({ id: "2", pay_date: "2026-09-30", tax_code: "1257L" }),
      ]),
    ).toEqual([]);
  });
});

describe("payslip coverage", () => {
  it("names the months with nothing on file", () => {
    const gaps = payslipCoverage([
      slip({ id: "1", pay_date: "2026-05-31" }),
      slip({ id: "2", pay_date: "2026-06-30" }),
      slip({ id: "3", pay_date: "2026-09-30" }),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.missing).toEqual(["2026-07", "2026-08"]);
    expect(gaps[0]!.seen).toBe(3);
    expect(gaps[0]!.expected).toBe(5);
  });

  it("reports nothing when every month is present", () => {
    expect(
      payslipCoverage([
        slip({ id: "1", pay_date: "2026-07-31" }),
        slip({ id: "2", pay_date: "2026-08-31" }),
      ]),
    ).toEqual([]);
  });
});
