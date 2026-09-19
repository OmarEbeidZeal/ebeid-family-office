import { describe, expect, it } from "vitest";
import { jobHealth } from "./automation-status";

const now = Date.parse("2026-09-19T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

describe("scheduled job health", () => {
  it("calls a job failing when its most recent run failed, and says why", () => {
    const health = jobHealth(
      { status: "failed", message: "The job endpoint answered 404.", ran_at: minutesAgo(4) },
      24,
      now,
    );
    expect(health.state).toBe("failing");
    expect(health.label).toBe("Failing");
    expect(health.message).toBe("The job endpoint answered 404.");
    expect(health.attention).toBe(true);
  });

  it("still explains a failure that recorded no message", () => {
    const health = jobHealth({ status: "failed", message: null, ran_at: minutesAgo(4) }, 24, now);
    expect(health.message).toMatch(/did not complete/);
  });

  it("does not hide a failure behind a recent timestamp", () => {
    expect(jobHealth({ status: "failed", message: "404", ran_at: minutesAgo(1) }, 24, now).state).toBe(
      "failing",
    );
  });

  it("reads a quiet run as nothing to do, not as a problem", () => {
    const health = jobHealth({ status: "skipped", message: null, ran_at: minutesAgo(10) }, 24, now);
    expect(health.state).toBe("quiet");
    expect(health.attention).toBe(false);
  });

  it("flags a job that has missed its turn", () => {
    const health = jobHealth({ status: "ok", message: null, ran_at: minutesAgo(60 * 40) }, 24, now);
    expect(health.state).toBe("overdue");
    expect(health.message).toMatch(/Overdue/);
  });

  it("says plainly when a job has never run", () => {
    expect(jobHealth(undefined, 24, now).state).toBe("never");
  });
});
