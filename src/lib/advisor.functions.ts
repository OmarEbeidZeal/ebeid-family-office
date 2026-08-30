/**
 * Advisor server functions: the standing briefing and the household snapshot
 * behind it. The conversation itself streams through the route in
 * `src/routes/api/advisor/chat.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BriefingResult = {
  status: "written" | "nothing_material" | "unavailable";
  created: number;
  skipped: number;
  /** Plain-English outcome, shown verbatim. */
  message: string;
  generatedAt: string;
};

/**
 * Runs the standing briefing: detect real signals, ask the model to write up
 * only the ones that matter, and store the genuinely new ones.
 */
export const generateBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BriefingResult> => {
    const { runBriefing } = await import("@/lib/advisor/briefing.server");
    return runBriefing(context.supabase, context.userId);
  });

const readInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

/** Marking notes read is a plain write, but the dashboard badge depends on it. */
export const markNotesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => readInput.parse(data))
  .handler(async ({ data, context }): Promise<{ updated: number }> => {
    const { error } = await context.supabase
      .from("advisor_notes")
      .update({ is_read: true })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { updated: data.ids.length };
  });
