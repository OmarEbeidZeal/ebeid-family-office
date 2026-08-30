import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DeliveryStatus = {
  emailConfigured: boolean;
  /** The address the digest would arrive from, when email is available. */
  from: string | null;
  message: string;
};

/**
 * Settings → Notifications: whether the optional email copy can be sent at all.
 * The briefing itself never depends on this.
 */
export const getDeliveryStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<DeliveryStatus> => {
    const { emailConfigured, emailFrom } = await import("@/lib/email/resend.server");
    const configured = emailConfigured();
    return {
      emailConfigured: configured,
      from: configured ? emailFrom() : null,
      message: configured
        ? "Email delivery is live. The digest carries the same notes you see in the app."
        : "Email delivery becomes available once a RESEND_API_KEY is added in Project Settings → Secrets. Until then the briefing is delivered in the app only.",
    };
  });
