import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statementInput = z.object({ statementId: z.string().uuid() });
const ruleInput = z.object({ ruleId: z.string().uuid() });

/**
 * Reads an uploaded statement and writes its transactions.
 * Safe to call again: re-parsing an already-imported statement reports the
 * duplicates rather than doubling the ledger.
 */
export const parseStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementInput.parse(data))
  .handler(async ({ data, context }) => {
    const { importStatement } = await import("./statement-import.server");
    return importStatement(context.supabase, data.statementId, context.userId);
  });

/** Applies a newly created category rule to transactions already imported. */
export const applyCategoryRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ruleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { applyRuleToExisting } = await import("./statement-import.server");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("household_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.household_id) throw new Error("No household is linked to this account.");
    const updated = await applyRuleToExisting(context.supabase, profile.household_id, data.ruleId);
    return { updated };
  });
