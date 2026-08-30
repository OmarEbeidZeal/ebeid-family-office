/**
 * The weekly briefing as an email.
 *
 * Same restraint as the app: near-black ground, one gold accent, severity
 * carried by a small coloured rule rather than a shouty banner. Pure string
 * building — no network, no secrets — so it can be read and reasoned about on
 * its own. Email clients get hex and tables; oklch and flexbox do not travel.
 */
export type DigestNote = {
  title: string;
  body: string | null;
  severity: string;
  kind: string;
};

export type DigestInput = {
  householdName: string | null;
  recipientName?: string | null;
  notes: DigestNote[];
  generatedAt: string;
  advisorUrl: string;
};

const COLOURS = {
  page: "#0A0B0D",
  card: "#121417",
  raised: "#171A1E",
  border: "#1F2328",
  text: "#E9E5DE",
  muted: "#8F949E",
  gold: "#C9A961",
  urgent: "#F87171",
  action: "#E3B341",
  info: "#8F949E",
};

const SEVERITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  action: "Needs a decision",
  info: "For information",
};

const KIND_LABEL: Record<string, string> = {
  briefing: "Briefing",
  recommendation: "Recommendation",
  alert: "Alert",
  risk: "Risk",
};

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const severityColour = (severity: string) =>
  severity === "urgent" ? COLOURS.urgent : severity === "action" ? COLOURS.action : COLOURS.info;

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Markdown arrives from the model in a small, predictable dialect: bold, a
 * bullet list, the occasional inline code span. Anything else is left as text.
 */
function bodyToHtml(body: string) {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const inline = (text: string) =>
    escape(text)
      .replace(
        /\*\*([^*]+)\*\*/g,
        `<strong style="color:${COLOURS.text};font-weight:600">$1</strong>`,
      )
      .replace(/`([^`]+)`/g, `<span style="font-family:ui-monospace,Menlo,monospace">$1</span>`)
      .replace(/\n/g, "<br />");

  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      const isList = lines.every((line) => /^[-*•]\s+/.test(line));
      if (isList) {
        const items = lines
          .map(
            (line) =>
              `<li style="margin:0 0 6px 0;padding:0">${inline(line.replace(/^[-*•]\s+/, ""))}</li>`,
          )
          .join("");
        return `<ul style="margin:0 0 14px 0;padding:0 0 0 18px;color:${COLOURS.text};font-size:14px;line-height:1.65">${items}</ul>`;
      }
      return `<p style="margin:0 0 14px 0;color:${COLOURS.text};font-size:14px;line-height:1.65">${inline(block)}</p>`;
    })
    .join("");
}

export function briefingSubject(input: DigestInput) {
  const urgent = input.notes.filter((note) => note.severity === "urgent").length;
  const count = input.notes.length;
  const head = urgent ? `${urgent} urgent · ` : "";
  return `${head}${count} briefing note${count === 1 ? "" : "s"} — ${formatDate(input.generatedAt)}`;
}

export function briefingHtml(input: DigestInput) {
  const greeting = input.recipientName ? `${escape(input.recipientName)},` : "Good morning,";
  const household = input.householdName ? escape(input.householdName) : "your household";

  const notes = input.notes
    .map((note) => {
      const colour = severityColour(note.severity);
      return `
      <tr>
        <td style="padding:0 0 12px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOURS.raised};border:1px solid ${COLOURS.border};border-radius:8px;border-collapse:separate">
            <tr>
              <td style="padding:18px 20px">
                <p style="margin:0 0 8px 0;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:${colour}">
                  ${escape(SEVERITY_LABEL[note.severity] ?? note.severity)} · ${escape(KIND_LABEL[note.kind] ?? note.kind)}
                </p>
                <p style="margin:0 0 10px 0;font-size:16px;line-height:1.35;color:${COLOURS.text};font-weight:500">
                  ${escape(note.title)}
                </p>
                ${note.body ? bodyToHtml(note.body) : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${escape(briefingSubject(input))}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOURS.page};color:${COLOURS.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">
      ${escape(input.notes[0]?.title ?? "This week's briefing")}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOURS.page};padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLOURS.card};border:1px solid ${COLOURS.border};border-radius:10px;border-collapse:separate">
            <tr>
              <td style="padding:28px 28px 8px 28px">
                <p style="margin:0;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${COLOURS.gold}">
                  Ebeid Family Office
                </p>
                <h1 style="margin:14px 0 6px 0;font-size:24px;font-weight:300;letter-spacing:-0.2px;color:${COLOURS.text}">
                  This week's briefing
                </h1>
                <p style="margin:0;font-size:13px;color:${COLOURS.muted}">
                  ${household} · ${formatDate(input.generatedAt)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px 28px">
                <p style="margin:0 0 18px 0;font-size:14px;line-height:1.65;color:${COLOURS.text}">
                  ${greeting} the advisor read your stored position this morning and found
                  ${input.notes.length} thing${input.notes.length === 1 ? "" : "s"} worth raising.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${notes}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px 28px">
                <a href="${escape(input.advisorUrl)}"
                   style="display:inline-block;padding:12px 22px;border:1px solid ${COLOURS.gold};border-radius:6px;color:${COLOURS.gold};font-size:14px;text-decoration:none">
                  Open the advisor
                </a>
                <p style="margin:22px 0 0 0;padding-top:16px;border-top:1px solid ${COLOURS.border};font-size:11px;line-height:1.7;color:${COLOURS.muted}">
                  Figures come from the household's own records at the time of writing. This is an
                  information and modelling tool, not regulated financial advice — confirm decisions
                  with an FCA-authorised adviser. Delivery can be turned off under Settings →
                  Notifications.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function briefingText(input: DigestInput) {
  const lines = [
    "EBEID FAMILY OFFICE",
    `This week's briefing — ${formatDate(input.generatedAt)}`,
    "",
  ];
  for (const note of input.notes) {
    lines.push(
      `[${(SEVERITY_LABEL[note.severity] ?? note.severity).toUpperCase()}] ${note.title}`,
      note.body ? note.body.replace(/\*\*/g, "") : "",
      "",
    );
  }
  lines.push(
    `Open the advisor: ${input.advisorUrl}`,
    "",
    "Information and modelling only — not regulated financial advice.",
  );
  return lines.join("\n");
}
