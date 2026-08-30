/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
});

export const PRIVATE_ACCESS_MESSAGE =
  "This is a private system. Access is by invitation only.";

/**
 * Allowlisted signup. Rejects any email that is not present in allowed_emails,
 * then provisions the household (owner) or joins the inviting household (member).
 */
export const registerAllowedUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => signUpSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { DEFAULT_CATEGORIES } = await import("./onboarding-seed.server");

    const email = data.email.trim().toLowerCase();

    const { data: allowed, error: allowedError } = await supabaseAdmin
      .from("allowed_emails")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (allowedError) throw new Error(allowedError.message);
    if (!allowed) throw new Error(PRIVATE_ACCESS_MESSAGE);

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createError || !created.user) {
      throw new Error(createError?.message ?? "Could not create the account.");
    }
    const userId = created.user.id;

    try {
      let householdId = allowed.household_id;

      if (!householdId) {
        const { data: household, error: householdError } = await supabaseAdmin
          .from("households")
          .insert({ name: "Ebeid Family Office", base_currency: "GBP" })
          .select("id")
          .single();
        if (householdError) throw new Error(householdError.message);
        householdId = household.id;

        const { error: catError } = await (supabaseAdmin as any).from("categories").insert(
          DEFAULT_CATEGORIES.map((c) => ({ ...c, household_id: householdId, is_system: true })),
        );
        if (catError) throw new Error(catError.message);
      }

      const { error: profileError } = await (supabaseAdmin as any).from("profiles").insert({
        id: userId,
        household_id: householdId,
        email,
        full_name: data.fullName,
        display_name: data.fullName.split(" ")[0],
        role: allowed.role,
      });
      if (profileError) throw new Error(profileError.message);

      await supabaseAdmin
        .from("allowed_emails")
        .update({ claimed_at: new Date().toISOString(), household_id: householdId })
        .eq("id", allowed.id);

      return { ok: true as const };
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw error;
    }
  });
