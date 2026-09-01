/**
 * Repair actions the Accounts page asks the server to perform.
 *
 * Both of these move real money records between accounts, so both run
 * household-scoped on the server and never trust an id from the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const mergeInput = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

const refileInput = z.object({
  statementId: z.string().uuid(),
  accountId: z.string().uuid(),
});

async function viewerOf(supabase: unknown, userId: string) {
  const { resolveViewer } = await import("./viewer.server");
  return resolveViewer(supabase, userId);
}

/**
 * Folds one account into another: transactions, statements, holdings, trades
 * and remembered identifiers all move, overlapping entries are dropped once,
 * and the account that is left restates its balance from what it now holds.
 */
export const mergeAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => mergeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);
    const { mergeAccounts: run } = await import("./accounts/repair.server");
    return run(context.supabase, {
      householdId,
      sourceId: data.sourceId,
      targetId: data.targetId,
    });
  });

/** Moves one statement, and the transactions it imported, to another account. */
export const refileStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refileInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);
    const { refileStatement: run } = await import("./accounts/repair.server");
    return run(context.supabase, {
      householdId,
      statementId: data.statementId,
      accountId: data.accountId,
    });
  });
