import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";
import { babyTaskTemplate } from "@/lib/planning/baby-plan";
import { daysBetween } from "@/lib/planning/dates";
import type { LifeEventRow } from "@/hooks/useFinancials";

const STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "confirmed", label: "Confirmed" },
  { value: "happened", label: "Arrived" },
];

/**
 * The due date is the anchor for the whole plan: every statutory deadline,
 * the funded-hours start and the leave schedule are derived from it, and
 * moving it moves them all. Nothing else here is guessed.
 */
export function BabyEventSheet({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: LifeEventRow | null;
}) {
  const { household } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("New baby");
  const [expectedDate, setExpectedDate] = useState("");
  const [childCount, setChildCount] = useState("1");
  const [status, setStatus] = useState("planned");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? "New baby");
    setExpectedDate(event?.expected_date ?? "");
    setChildCount(String(event?.child_count ?? 1));
    setStatus(event?.status ?? "planned");
    setNotes(event?.notes ?? "");
    setError(null);
  }, [open, event]);

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        event_type: "new_baby",
        title: title.trim() || "New baby",
        expected_date: expectedDate,
        child_count: Math.max(1, Math.round(Number(childCount) || 1)),
        status,
        notes: notes.trim() || null,
      };

      if (event) {
        const { error: updateError } = await db
          .from("life_events")
          .update(values)
          .eq("id", event.id);
        if (updateError) throw updateError;
        return event.id;
      }

      const { data, error: insertError } = await db
        .from("life_events")
        .insert({ ...values, household_id: household!.id })
        .select("id")
        .single();
      if (insertError) throw insertError;
      const eventId = (data as { id: string }).id;

      // The checklist is derived, not invented: each task carries its offset
      // from the due date so the database can re-anchor it if the date moves.
      const tasks = babyTaskTemplate(expectedDate).map((task, index) => ({
        household_id: household!.id,
        life_event_id: eventId,
        task_key: task.key,
        title: task.title,
        detail: task.detail || null,
        offset_days: daysBetween(expectedDate, task.dueDate),
        category: task.category,
        is_legal_deadline: task.hard,
        sort_order: index,
      }));
      const { error: taskError } = await db.from("life_event_tasks").insert(tasks);
      if (taskError) throw taskError;
      return eventId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["life_events"] });
      queryClient.invalidateQueries({ queryKey: ["life_event_tasks"] });
      toast.success(event ? "Plan updated" : "Baby plan created");
      onOpenChange(false);
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={event ? "Edit the plan" : "Plan a new baby"}
      description="Everything statutory follows from the due date. Change it later and every deadline in the plan moves with it."
      pending={save.isPending}
      submitLabel={event ? "Save" : "Create plan"}
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (!expectedDate) {
          setError("A due date is required — the whole plan hangs off it.");
          return;
        }
        setError(null);
        save.mutate();
      }}
      footerNote={
        event
          ? "Moving the due date re-dates every task and every outgoing anchored to it."
          : "Creating the plan also writes the statutory checklist: MATB1, notifying the employer, registering the birth, claiming Child Benefit and applying for funded hours."
      }
    >
      <FullRow>
        <Field label="What to call it">
          <Input value={title} onChange={(input) => setTitle(input.target.value)} />
        </Field>
      </FullRow>

      <Field label="Due date" error={error ?? undefined}>
        <Input
          type="date"
          value={expectedDate}
          onChange={(input) => setExpectedDate(input.target.value)}
        />
      </Field>

      <Field label="Babies expected" hint="Twins change Child Benefit, not statutory pay.">
        <Input
          type="number"
          min={1}
          max={4}
          value={childCount}
          onChange={(input) => setChildCount(input.target.value)}
        />
      </Field>

      <FullRow>
        <Field label="Status">
          <SelectNative value={status} onChange={setStatus} options={STATUSES} />
        </Field>
      </FullRow>

      <FullRow>
        <Field label="Notes">
          <Textarea
            rows={3}
            value={notes}
            onChange={(input) => setNotes(input.target.value)}
            placeholder="Hospital, midwife, anything worth keeping with the plan."
          />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
