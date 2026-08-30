import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, CircleAlert, Info, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { generateBriefing, markNotesRead } from "@/lib/advisor.functions";
import type { AdvisorNoteRow } from "@/hooks/useFinancials";
import { Markdown } from "@/components/advisor/Markdown";
import { cn } from "@/lib/utils";

const SEVERITY: Record<
  string,
  { icon: typeof Info; tone: string; ring: string; label: string }
> = {
  urgent: {
    icon: AlertTriangle,
    tone: "text-loss",
    ring: "border-loss/40 bg-loss/10",
    label: "Act now",
  },
  action: {
    icon: CircleAlert,
    tone: "text-warn",
    ring: "border-warn/40 bg-warn-soft",
    label: "Decide soon",
  },
  info: {
    icon: Info,
    tone: "text-muted-foreground",
    ring: "border-border bg-surface-raised",
    label: "For information",
  },
};

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 1) return `${days} days ago`;
  if (days === 1) return "yesterday";
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  return "just now";
}

function Note({ note, onRead }: { note: AdvisorNoteRow; onRead: (id: string) => void }) {
  const [open, setOpen] = useState(!note.is_read);
  const severity = SEVERITY[note.severity] ?? SEVERITY["info"]!;
  const Icon = severity.icon;

  return (
    <article
      className={cn(
        "rounded-lg border p-4 transition-colors",
        note.is_read ? "border-border bg-surface" : severity.ring,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", severity.tone)} strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="block w-full text-left"
          >
            <h3 className="text-sm font-medium leading-snug text-foreground">{note.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
              <span className={severity.tone}>{severity.label}</span>
              <span aria-hidden>·</span>
              <span>{relative(note.generated_at)}</span>
              {note.related_ticker ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="num">{note.related_ticker}</span>
                </>
              ) : null}
              {!note.is_read && (
                <span className="rounded-full bg-gold px-1.5 py-px text-[0.58rem] tracking-[0.08em] text-background">
                  New
                </span>
              )}
            </p>
          </button>

          {open && note.body ? (
            <div className="mt-3 border-t border-border/70 pt-3">
              <Markdown>{note.body}</Markdown>
            </div>
          ) : null}

          {!note.is_read && (
            <button
              type="button"
              onClick={() => onRead(note.id)}
              className="mt-3 inline-flex items-center gap-1.5 text-[0.7rem] text-muted-foreground transition-colors hover:text-gold"
            >
              <Check className="h-3 w-3" />
              Mark read
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The standing briefing: only findings the app can prove from stored data,
 * written up once and then left alone until the situation actually changes.
 */
export function BriefingPanel({
  notes,
  loading,
  canRun,
}: {
  notes: AdvisorNoteRow[];
  loading: boolean;
  canRun: boolean;
}) {
  const queryClient = useQueryClient();
  const runBriefing = useServerFn(generateBriefing);
  const markRead = useServerFn(markNotesRead);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["advisor_notes"] });

  const run = useMutation({
    mutationFn: () => runBriefing(),
    onSuccess: (result) => {
      if (result.status === "written") toast.success(result.message);
      else if (result.status === "nothing_material") toast.info(result.message);
      else toast.error(result.message);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message || "The briefing could not be produced."),
  });

  const read = useMutation({
    mutationFn: (ids: string[]) => markRead({ data: { ids } }),
    onSuccess: () => void refresh(),
  });

  const unread = notes.filter((note) => !note.is_read);
  const latest = notes[0];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium tracking-tight text-foreground">Standing briefing</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {latest
              ? `Last run ${relative(latest.generated_at)}${
                  unread.length ? ` · ${unread.length} unread` : ""
                }`
              : "Not run yet."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread.length > 1 && (
            <button
              type="button"
              onClick={() => read.mutate(unread.map((note) => note.id))}
              disabled={read.isPending}
              className="h-8 rounded-md border border-border bg-surface-raised px-3 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => run.mutate()}
            disabled={run.isPending || !canRun}
            title={canRun ? undefined : "Add accounts and holdings first"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gold-line bg-gold-soft px-3 text-xs text-gold transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {run.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {run.isPending ? "Reading your position…" : "Run briefing"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="hairline rounded-lg bg-surface p-4">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton mt-2 h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : notes.length ? (
        <div className="space-y-3">
          {notes.slice(0, 12).map((note) => (
            <Note key={note.id} note={note} onRead={(id) => read.mutate([id])} />
          ))}
        </div>
      ) : (
        <div className="hairline rounded-lg bg-surface p-5">
          <p className="text-sm text-foreground/85">
            No briefing notes yet. Run one and the advisor will check your reserve, allowance
            deadlines, concentration limits, goal pace and stale valuations, and write up only what
            it can prove from your stored numbers.
          </p>
          {!canRun && (
            <p className="mt-3 text-xs text-muted-foreground">
              Add at least one account or asset first — there is nothing to brief on yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
