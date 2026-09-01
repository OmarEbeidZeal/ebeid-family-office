import { describe, expect, it } from "vitest";

import { detectTransfers } from "./categorise.server";
import { indexPersonNames, ownNameHit, personLabel, suggestPerson } from "./people";

const OMAR = indexPersonNames({
  id: "p-omar",
  names: ["Omar Ebeid", "Omar", "MR O EBEID"],
});
const HAYA = indexPersonNames({ id: "p-haya", names: ["Haya Ebeid"] });
const PEOPLE = [OMAR, HAYA];

describe("ownNameHit", () => {
  it("recognises the household's own name on a payment", () => {
    expect(ownNameHit("OMAR EBEID", PEOPLE)).toBeTruthy();
    expect(ownNameHit("TRANSFER TO O EBEID", PEOPLE)).toBeTruthy();
    expect(ownNameHit("HAYA EBEID SAVINGS", PEOPLE)).toBeTruthy();
  });

  it("reads an initial-and-surname the way a bank prints it", () => {
    expect(ownNameHit("MR O EBEID", PEOPLE)).toBeTruthy();
    expect(ownNameHit("EBEID O", PEOPLE)).toBeTruthy();
  });

  it("does not fire on the surname alone", () => {
    // A shop or a landlord could be called Ebeid. One token is not identity.
    expect(ownNameHit("EBEID CATERING LTD", PEOPLE)).toBeNull();
  });

  it("does not fire on the forename alone", () => {
    expect(ownNameHit("OMAR", PEOPLE)).toBeNull();
    expect(ownNameHit("CAFE OMAR", PEOPLE)).toBeNull();
  });

  it("leaves a salary carrying the employee's name as income", () => {
    // The employer is the counterparty here, not Omar — and misreading this
    // would delete the household's largest genuine credit.
    expect(ownNameHit("ZEAL GROUP PAYROLL", PEOPLE)).toBeNull();
    expect(ownNameHit("BACS ZEAL SALARY", PEOPLE)).toBeNull();
  });

  it("ignores an empty or absent counterparty", () => {
    expect(ownNameHit(null, PEOPLE)).toBeNull();
    expect(ownNameHit("", PEOPLE)).toBeNull();
    expect(ownNameHit("OMAR EBEID", [])).toBeNull();
  });
});

describe("suggestPerson", () => {
  it("finds the person a statement is addressed to", () => {
    expect(suggestPerson("MR OMAR EBEID", PEOPLE)?.id).toBe("p-omar");
    expect(suggestPerson("Haya Ebeid", PEOPLE)?.id).toBe("p-haya");
  });

  it("refuses when the surname alone cannot tell two people apart", () => {
    expect(suggestPerson("EBEID", PEOPLE)).toBeNull();
  });

  it("refuses a holder line naming both of them", () => {
    // A joint account belongs to neither one of them alone.
    expect(suggestPerson("OMAR EBEID & HAYA EBEID", PEOPLE)).toBeNull();
  });
});

const DAY = 86_400_000;
const date = (offset: number) =>
  new Date(Date.UTC(2026, 2, 1) + offset * DAY).toISOString().slice(0, 10);

type Row = Parameters<typeof detectTransfers>[0][number];

function tx(input: Partial<Row> & { id: string; direction: string; amount: number }): Row {
  return {
    account_id: "acc-a",
    booked_date: date(0),
    amount_base: input.amount,
    is_transfer: false,
    merchant: null,
    description: null,
    ...input,
  } as Row;
}

describe("detectTransfers — pairing", () => {
  it("pairs a payment out of one account with the arrival in another", () => {
    const found = detectTransfers([
      tx({ id: "out", direction: "debit", amount: 2500, account_id: "acc-a" }),
      tx({
        id: "in",
        direction: "credit",
        amount: 2500,
        account_id: "acc-b",
        booked_date: date(1),
      }),
    ]);
    expect(found).toEqual(new Set(["out", "in"]));
  });

  it("allows the spread on a cross-currency move", () => {
    const found = detectTransfers([
      tx({ id: "out", direction: "debit", amount: 1000, account_id: "acc-a" }),
      tx({ id: "in", direction: "credit", amount: 991, account_id: "acc-b" }),
    ]);
    expect(found.size).toBe(2);
  });

  it("does not pair across a gap of more than three days", () => {
    const found = detectTransfers([
      tx({ id: "out", direction: "debit", amount: 2500, account_id: "acc-a" }),
      tx({
        id: "in",
        direction: "credit",
        amount: 2500,
        account_id: "acc-b",
        booked_date: date(5),
      }),
    ]);
    expect(found.size).toBe(0);
  });

  it("does not pair within a single account", () => {
    const found = detectTransfers([
      tx({ id: "out", direction: "debit", amount: 2500, account_id: "acc-a" }),
      tx({ id: "in", direction: "credit", amount: 2500, account_id: "acc-a" }),
    ]);
    expect(found.size).toBe(0);
  });

  it("uses each arrival once, so two identical payments need two arrivals", () => {
    const found = detectTransfers([
      tx({ id: "out1", direction: "debit", amount: 500, account_id: "acc-a" }),
      tx({ id: "out2", direction: "debit", amount: 500, account_id: "acc-a" }),
      tx({ id: "in1", direction: "credit", amount: 500, account_id: "acc-b" }),
    ]);
    expect(found).toEqual(new Set(["out1", "in1"]));
  });
});

describe("detectTransfers — the counterparty's own name", () => {
  it("catches money arriving from an account that was never imported", () => {
    // Omar's largest single credit is himself. Nothing pairs with it.
    const found = detectTransfers(
      [tx({ id: "self", direction: "credit", amount: 40_000, merchant: "OMAR EBEID" })],
      PEOPLE,
    );
    expect(found.has("self")).toBe(true);
  });

  it("catches it from the description when the merchant is blank", () => {
    const found = detectTransfers(
      [
        tx({
          id: "self",
          direction: "debit",
          amount: 12_000,
          description: "FASTER PAYMENT TO O EBEID",
        }),
      ],
      PEOPLE,
    );
    expect(found.has("self")).toBe(true);
  });

  it("leaves the salary alone", () => {
    const found = detectTransfers(
      [
        tx({
          id: "salary",
          direction: "credit",
          amount: 6200,
          merchant: "Zeal Payroll",
          description: "ZEAL GROUP LTD SALARY",
        }),
      ],
      PEOPLE,
    );
    expect(found.size).toBe(0);
  });

  it("does nothing at all when the household's names are unknown", () => {
    const found = detectTransfers([
      tx({ id: "self", direction: "credit", amount: 40_000, merchant: "OMAR EBEID" }),
    ]);
    expect(found.size).toBe(0);
  });
});

describe("personLabel", () => {
  it("capitalises a name typed in lower case, because that is a keyboard artefact", () => {
    expect(personLabel("omar")).toBe("Omar");
    expect(personLabel("haya abdin")).toBe("Haya Abdin");
  });

  it("leaves deliberate casing exactly as the household wrote it", () => {
    expect(personLabel("de Souza")).toBe("de Souza");
    expect(personLabel("McKay")).toBe("McKay");
    expect(personLabel("HAYA")).toBe("HAYA");
  });

  it("handles hyphens and apostrophes without swallowing them", () => {
    expect(personLabel("mary-jane o'brien")).toBe("Mary-Jane O'Brien");
  });

  it("returns an empty string for nothing on file, so callers can fall through", () => {
    expect(personLabel(null)).toBe("");
    expect(personLabel("   ")).toBe("");
  });
});
