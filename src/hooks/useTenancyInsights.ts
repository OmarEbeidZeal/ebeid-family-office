/**
 * What the tenancy agreements mean for the calendar and the forecast.
 *
 * A lease is three financial facts wearing one coat: a recurring outgoing, a
 * deposit that is really an asset, and a date by which a decision has to be
 * made. This pulls all three out and says which are already wired into the
 * forecast, the balance sheet and the timeline.
 */
import { useMemo } from "react";
import { useCurrency } from "./useCurrency";
import { useTenancies, type TenancyRow } from "./useDocuments";
import { useAssets, useForecastExpenses, useGoals } from "./useFinancials";
import {
  noticeWindow,
  rentPerMonth,
  rentTrajectory,
  tenancyStatusOn,
  type NoticeWindow,
} from "@/lib/documents/analysis";
import type { RentFrequency } from "@/lib/documents/types";

export type TenancyView = {
  row: TenancyRow;
  status: "upcoming" | "current" | "ended";
  monthlyRent: number | null;
  monthlyRentBase: number | null;
  annualRentBase: number;
  notice: NoticeWindow;
  /** The rent is already an outgoing in the five-year forecast. */
  inForecast: boolean;
  /** The deposit is already carried as a recoverable asset. */
  depositTracked: boolean;
};

export function useTenancyInsights() {
  const { base, convert } = useCurrency();
  const tenancies = useTenancies();
  const expenses = useForecastExpenses();
  const assets = useAssets();
  const goals = useGoals();

  return useMemo(() => {
    const rows = tenancies.data ?? [];
    const expenseIds = new Set((expenses.data ?? []).map((row) => row.id));
    const assetIds = new Set((assets.data ?? []).map((row) => row.id));

    const views: TenancyView[] = rows.map((row) => {
      const monthlyRent =
        row.rent_amount === null
          ? null
          : rentPerMonth(Number(row.rent_amount), row.rent_frequency as RentFrequency);
      const monthlyRentBase =
        monthlyRent === null ? null : convert(monthlyRent, row.currency, base);

      return {
        row,
        status: tenancyStatusOn(row.term_start, row.term_end),
        monthlyRent,
        monthlyRentBase,
        annualRentBase: (monthlyRentBase ?? 0) * 12,
        notice: noticeWindow(row),
        inForecast: !!row.linked_expense_id && expenseIds.has(row.linked_expense_id),
        depositTracked: !!row.linked_asset_id && assetIds.has(row.linked_asset_id),
      };
    });

    const asTenant = views.filter((view) => view.row.role === "tenant");
    const current = views.filter((view) => view.status === "current");
    const currentAsTenant = current.filter((view) => view.row.role === "tenant");

    const monthlyRentOut = currentAsTenant.reduce(
      (sum, view) => sum + (view.monthlyRentBase ?? 0),
      0,
    );
    const monthlyRentIn = current
      .filter((view) => view.row.role === "landlord")
      .reduce((sum, view) => sum + (view.monthlyRentBase ?? 0), 0);

    const depositsHeld = views
      .filter((view) => view.status !== "ended" && view.row.role === "tenant")
      .reduce(
        (sum, view) =>
          sum + convert(Number(view.row.deposit_amount ?? 0), view.row.currency, base),
        0,
      );

    // Rent paid to date, from the agreements themselves rather than a guess.
    const trajectory = rentTrajectory(
      asTenant.map((view) => ({
        property_address: view.row.property_address,
        role: view.row.role,
        rent_amount:
          view.row.rent_amount === null
            ? null
            : convert(Number(view.row.rent_amount), view.row.currency, base),
        rent_frequency: view.row.rent_frequency,
        currency: base,
        term_start: view.row.term_start,
        term_end: view.row.term_end,
      })),
    );

    // Prorated per year by the trajectory itself, so a tenancy that began in
    // September counts four months of rent that year rather than twelve.
    const rentPaidToDate = trajectory.reduce((sum, point) => sum + point.paid, 0);

    // The decision that lands soonest across every live agreement.
    const nextDecision = views
      .filter((view) => view.status !== "ended" && view.notice.daysToDecision !== null)
      .sort((a, b) => (a.notice.daysToDecision ?? 0) - (b.notice.daysToDecision ?? 0))[0] ?? null;

    const propertyGoal =
      (goals.data ?? []).find(
        (goal) => goal.goal_category === "property" && goal.status !== "achieved",
      ) ?? null;

    return {
      base,
      loading: tenancies.isLoading,
      views,
      current,
      upcoming: views.filter((view) => view.status === "upcoming"),
      ended: views.filter((view) => view.status === "ended"),
      monthlyRentOut,
      monthlyRentIn,
      depositsHeld,
      trajectory,
      rentPaidToDate,
      nextDecision,
      propertyGoal,
      needsReview: rows.filter((row) => row.needs_review),
    };
  }, [
    tenancies.data,
    tenancies.isLoading,
    expenses.data,
    assets.data,
    goals.data,
    base,
    convert,
  ]);
}

export type TenancyInsights = ReturnType<typeof useTenancyInsights>;
