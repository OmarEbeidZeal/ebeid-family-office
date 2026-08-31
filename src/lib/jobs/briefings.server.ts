/**
 * The scheduled briefing.
 *
 * Generating a note nobody sees is not advice, so this does two things: run the
 * same briefing generator `/advisor` runs, then deliver it. Delivery is in-app
 * first — the unread badge is the reliable channel and needs nothing configured
 * — with email as an optional second copy when a Resend key exists.
 *
 * The scheduler wakes this daily at 07:00 UTC and each household is briefed on
 * the weekday its members chose (Sunday unless they changed it), so "choose the
 * day" is a real preference rather than a fixed cron line.
 */
import type { Json } from "@/integrations/supabase/types";
import { runBriefingForHousehold } from "@/lib/advisor/briefing.server";
import {
  briefingHtml,
  briefingSubject,
  briefingText,
  type DigestNote,
} from "@/lib/email/briefing-digest";
import { emailConfigured, sendEmail } from "@/lib/email/resend.server";
import type { JobOutcome } from "./runs.server";

type ProfileRow = {
  id: string;
  household_id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  /** `pending` means invited but never signed in — nobody to deliver to. */
  status: string;

  weekly_briefing_enabled: boolean;
  briefing_day: number;
  briefing_email_enabled: boolean;
};

const SEVERITY_ORDER: Record<string, number> = { urgent: 0, action: 1, info: 2 };

const firstName = (profile: ProfileRow) =>
  (profile.display_name || profile.full_name || "").trim().split(/\s+/)[0] || null;

export async function runScheduledBriefings(input: {
  appUrl: string;
  now?: Date;
  /** Ignores the chosen weekday. Only reachable with the scheduler's secret. */
  force?: boolean;
}): Promise<JobOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = input.now ?? new Date();
  const weekday = now.getUTCDay();

  const [{ data: households, error: householdError }, { data: profileRows }] = await Promise.all([
    supabaseAdmin.from("households").select("id, name"),
    supabaseAdmin
      .from("profiles")
      .select(
        "id, household_id, email, display_name, full_name, status, weekly_briefing_enabled, briefing_day, briefing_email_enabled",
      ),
  ]);

  if (householdError) throw new Error(`Could not read households: ${householdError.message}`);
  if (!households?.length) {
    return { status: "skipped", message: "There are no households to brief." };
  }

  // Someone invited but not yet signed in has nowhere to receive a briefing.
  const profiles = ((profileRows ?? []) as ProfileRow[]).filter(
    (profile) => profile.status !== "pending",
  );
  const membersOf = (householdId: string) =>
    profiles.filter((profile) => profile.household_id === householdId);

  const due = households.filter((household) =>
    membersOf(household.id).some(
      (profile) =>
        profile.weekly_briefing_enabled && (input.force || profile.briefing_day === weekday),
    ),
  );

  if (!due.length) {
    return {
      status: "skipped",
      message: "No household has the briefing scheduled for today.",
      detail: { weekday } as Json,
    };
  }

  const results: Record<string, unknown>[] = [];
  let written = 0;
  let emailsSent = 0;
  let emailFailures = 0;

  for (const household of due) {
    let outcome;
    try {
      outcome = await runBriefingForHousehold(supabaseAdmin, household.id);
    } catch (error) {
      results.push({
        household: household.name,
        status: "failed",
        message: error instanceof Error ? error.message : "The briefing could not be generated.",
      });
      continue;
    }

    const entry: Record<string, unknown> = {
      household: household.name,
      status: outcome.status,
      created: outcome.created,
      message: outcome.message,
    };

    if (outcome.status === "written") {
      written += outcome.created;

      // Email is a second copy of what is already in the app. It is attempted
      // last, and a failure here never changes the briefing's own outcome.
      const delivery = await deliver({
        householdId: household.id,
        householdName: household.name,
        generatedAt: outcome.generatedAt,
        // Only the people whose own chosen day this is get the email; anyone
        // who picked a different day still sees the notes in the app, and is
        // not emailed on a day they did not ask for.
        recipients: membersOf(household.id).filter(
          (profile) =>
            profile.weekly_briefing_enabled &&
            profile.briefing_email_enabled &&
            !!profile.email &&
            (input.force || profile.briefing_day === weekday),
        ),
        appUrl: input.appUrl,
      });
      emailsSent += delivery.sent;
      emailFailures += delivery.failed;
      entry["email"] = delivery.note;
    }

    results.push(entry);
  }

  const briefed = results.filter((row) => row["status"] === "written").length;
  const failed = results.filter((row) => row["status"] === "failed").length;

  const message = briefed
    ? `${written} note${written === 1 ? "" : "s"} written for ${briefed} household${
        briefed === 1 ? "" : "s"
      }${emailsSent ? `, emailed to ${emailsSent} recipient${emailsSent === 1 ? "" : "s"}` : ""}.`
    : "The advisor read every position due today and found nothing new worth writing up.";

  return {
    status: failed ? "partial" : "ok",
    households: due.length,
    message,
    detail: { weekday, results, email_failures: emailFailures } as unknown as Json,
  };
}

async function deliver(input: {
  householdId: string;
  householdName: string | null;
  generatedAt: string;
  recipients: ProfileRow[];
  appUrl: string;
}): Promise<{ sent: number; failed: number; note: string }> {
  if (!input.recipients.length) {
    return { sent: 0, failed: 0, note: "Nobody has email delivery switched on." };
  }
  if (!emailConfigured()) {
    return {
      sent: 0,
      failed: 0,
      note: "Email delivery is available once a Resend key is added; the notes are in the app.",
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("advisor_notes")
    .select("title, body, severity, kind")
    .eq("household_id", input.householdId)
    .eq("generated_at", input.generatedAt);

  const notes = ((data ?? []) as DigestNote[]).sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
  );
  if (!notes.length) return { sent: 0, failed: 0, note: "Nothing to send." };

  const advisorUrl = `${input.appUrl.replace(/\/+$/, "")}/advisor`;
  let sent = 0;
  let failed = 0;
  const problems: string[] = [];

  for (const recipient of input.recipients) {
    const digest = {
      householdName: input.householdName,
      recipientName: firstName(recipient),
      notes,
      generatedAt: input.generatedAt,
      advisorUrl,
    };
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject: briefingSubject(digest),
        html: briefingHtml(digest),
        text: briefingText(digest),
      });
      if (result.ok) sent += 1;
      else {
        failed += 1;
        problems.push(result.message);
      }
    } catch (error) {
      failed += 1;
      problems.push(error instanceof Error ? error.message : "Send failed.");
    }
  }

  return {
    sent,
    failed,
    note: failed
      ? `${sent} sent, ${failed} failed: ${problems.slice(0, 2).join("; ")}`
      : `Emailed to ${sent} recipient${sent === 1 ? "" : "s"}.`,
  };
}
