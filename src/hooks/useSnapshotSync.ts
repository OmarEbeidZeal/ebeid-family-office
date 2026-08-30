import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "./useAuth";
import { useNetWorth } from "./useNetWorth";

/**
 * Writes one household-level net worth snapshot per day, so the trend chart is
 * built from real observations rather than a modelled curve. Never runs before
 * the household has data, and never invents a figure.
 */
export function useSnapshotSync() {
  const { household } = useAuth();
  const summary = useNetWorth({ householdWide: true });
  const queryClient = useQueryClient();
  const writtenFor = useRef<string | null>(null);

  const ready = !!household?.id && !summary.loading && summary.hasData;
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!ready) return;
    const key = `${household!.id}:${today}`;
    if (writtenFor.current === key) return;
    writtenFor.current = key;

    const run = async () => {
      const payload = {
        household_id: household!.id,
        as_of: today,
        total_assets: Number(summary.totalAssets.toFixed(2)),
        total_liabilities: Number(summary.totalLiabilities.toFixed(2)),
        net_worth: Number(summary.netWorth.toFixed(2)),
        liquid_net_worth: Number(summary.liquidNetWorth.toFixed(2)),
        base_currency: summary.base,
        breakdown: {
          by_class: summary.allocationByClass,
          by_currency: summary.allocationByCurrency,
        },
      };

      const { data: existing } = await db
        .from("net_worth_snapshots")
        .select("id")
        .eq("household_id", household!.id)
        .eq("as_of", today)
        .maybeSingle();

      if (existing) {
        await db.from("net_worth_snapshots").update(payload).eq("id", existing.id);
      } else {
        await db.from("net_worth_snapshots").insert(payload);
      }

      await queryClient.invalidateQueries({ queryKey: ["net_worth_snapshots"] });
    };

    void run().catch(() => {
      // A failed snapshot must never block the dashboard.
      writtenFor.current = null;
    });
  }, [ready, household, today, summary, queryClient]);
}
