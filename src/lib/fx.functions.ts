import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The on-demand refresh behind Settings → Exchange rates and the staleness
 * fallback in `useCurrency`. The scheduled twice-daily refresh runs the same
 * code through `/api/public/hooks/fx-refresh`.
 */
export const refreshFxRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { refreshFxRatesNow } = await import("@/lib/fx.server");
    return refreshFxRatesNow();
  });
