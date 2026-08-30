/**
 * Email delivery through Resend.
 *
 * Entirely optional: with no `RESEND_API_KEY` the app says so in Settings and
 * carries on. Nothing here is ever allowed to fail a briefing — a note that
 * exists in the app but did not reach an inbox is a delivery problem, not a
 * reason to lose the note.
 */
const ENDPOINT = "https://api.resend.com/emails";

/** Resend's shared sender works without a verified domain; a custom one is better. */
const DEFAULT_FROM = "Ebeid Family Office <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}

export function emailFrom(): string {
  return process.env["BRIEFING_FROM_EMAIL"] || DEFAULT_FROM;
}

export type SendResult = { ok: boolean; message: string; id?: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    return { ok: false, message: "No Resend key is configured, so no email was sent." };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;

    if (!response.ok) {
      return {
        ok: false,
        message: payload?.message ?? `Resend returned ${response.status}.`,
      };
    }

    return { ok: true, message: "Sent.", ...(payload?.id ? { id: payload.id } : {}) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The email provider could not be reached.",
    };
  }
}
