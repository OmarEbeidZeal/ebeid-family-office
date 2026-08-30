import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ASSUMPTIONS, type ForecastAssumptions } from "@/lib/forecast";

const KEY = "efo.forecast.assumptions.v1";

/**
 * Projection assumptions are a working view, not household data: they stay on
 * the device so the forecast and scenario pages agree with each other, and so
 * a half-finished stress test survives a refresh.
 */
export function useAssumptions(): [ForecastAssumptions, (next: ForecastAssumptions) => void] {
  const [assumptions, setAssumptions] = useState<ForecastAssumptions>(DEFAULT_ASSUMPTIONS);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ForecastAssumptions>;
      setAssumptions({ ...DEFAULT_ASSUMPTIONS, ...parsed });
    } catch {
      // A corrupt stored view is not worth surfacing — fall back to defaults.
    }
  }, []);

  const update = useCallback((next: ForecastAssumptions) => {
    setAssumptions(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private-mode storage failures must not break the projection.
    }
  }, []);

  return [assumptions, update];
}
