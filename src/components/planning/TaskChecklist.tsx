import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { babyTaskTemplate, TASK_CATEGORY_LABELS } from "@/lib/planning/baby-plan";
import { daysBetween, daysUntil, toIso } from "@/lib/planning/dates";
import { cn } from "@/lib/utils";
import type { LifeEventRow, LifeEventTaskRow } from "@/hooks/useFinancials";

/**
 * The statutory checklist. Ticking a row is the only editable thing here —
 * the dates come from the due date, so they cannot drift out of step with it.
 */
export function TaskChecklist({
  event,
  tasks,
  nurseryStart,
}: {
  event: LifeEventRow;
  tasks: LifeEventTaskRow[];
  nurseryStart: string | null;
}) {
  const { household } = useAuth();
  const queryClient = useQueryClient();
  const today = useMemo(() => toIso(new Date()), []);

  const toggle = useMutation({
    mutationFn: async ({ task, done }: { task: LifeEventTaskRow; done: boolean }) => {
      const { error } = await db
        .from("life_event_tasks")
        .update({
          status: done ? "done" : "todo",
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["life_event_tasks"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  /** Adds any template task the plan is missing, leaving ticked ones alone. */
  const refresh = useMutation({
    mutationFn: async () => {
      const existing = new Set(tasks.map((task) => task.task_key));
      const rows = babyTaskTemplate(event.expected_date, nurseryStart)
        .map((task, index) => ({ task, index }))
        .filter(({ task }) => !existing.has(task.key))
        .map(({ task, index }) => ({
          household_id: household!.id,
          life_event_id: event.id,
          task_key: task.key,
          title: task.title,
          detail: task.detail || null,
          offset_days: daysBetween(event.expected_date, task.dueDate),
          category: task.category,
          is_legal_deadline: task.hard,
          sort_order: index,
        }));
      if (!rows.length) return 0;
      const { error } = await db.from("life_event_tasks").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (added) => {
      queryClient.invalidateQueries({ queryKey: ["life_event_tasks"] });
      toast.success(added ? `${added} task${added === 1 ? "" : "s"} added` : "Nothing missing");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, LifeEventTaskRow[]>();
    for (const task of tasks) {
      const list = map.get(task.category) ?? [];
      list.push(task);
      map.set(task.category, list);
    }
    return [...map.entries()];
  }, [tasks]);

  const outstanding = tasks.filter((task) => task.status !== "done");
  const overdue = outstanding.filter(
    (task) => task.due_date && daysUntil(task.due_date, today) < 0,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {tasks.length - outstanding.length} of {tasks.length} done
          {overdue.length > 0 && (
            <span className="ml-2 text-loss">
              · {overdue.length} past its date
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Restore missing tasks
        </Button>
      </div>

      {grouped.map(([category, rows]) => (
        <div key={category}>
          <p className="eyebrow mb-2 text-foreground/60">
            {TASK_CATEGORY_LABELS[category as keyof typeof TASK_CATEGORY_LABELS] ?? category}
          </p>
          <ul className="hairline divide-y divide-border rounded-md bg-surface">
            {rows.map((task) => {
              const done = task.status === "done";
              const days = task.due_date ? daysUntil(task.due_date, today) : null;
              const late = !done && days !== null && days < 0;
              return (
                <li key={task.id} className="flex items-start gap-3 px-3 py-3">
                  <Checkbox
                    checked={done}
                    aria-label={task.title}
                    className="mt-0.5"
                    onCheckedChange={(checked) =>
                      toggle.mutate({ task, done: checked === true })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p
                        className={cn(
                          "text-sm",
                          done ? "text-muted-foreground line-through" : "text-foreground",
                        )}
                      >
                        {task.title}
                      </p>
                      {task.is_legal_deadline && !done && (
                        <AlertTriangle
                          className={cn("h-3 w-3", late ? "text-loss" : "text-gold")}
                          aria-label="Legal deadline"
                        />
                      )}
                    </div>
                    {task.detail && (
                      <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground">
                        {task.detail}
                      </p>
                    )}
                  </div>
                  <p
                    className={cn(
                      "num shrink-0 text-right text-xs",
                      late ? "text-loss" : "text-muted-foreground",
                    )}
                  >
                    {formatDate(task.due_date, "short")}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
