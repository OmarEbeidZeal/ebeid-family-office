import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SettingsCard } from "./SettingsCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { cleanGaps } from "@/lib/advisor/coverage";
import { useAuth } from "@/hooks/useAuth";

/**
 * What the records are known to be missing.
 *
 * The advisor reads whatever is on file, and on file is not the same as
 * complete. An account nobody has exported, a year of spending that predates the
 * first statement — each one turns a savings rate or a runway into fiction. Said
 * plainly here, the advisor stops presenting those figures as fact.
 */
export function KnownGapsCard() {
  const { household, isOwner } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText((household?.known_gaps ?? []).join("\n"));
  }, [household?.known_gaps]);

  const save = async () => {
    if (!household) return;
    setSaving(true);
    try {
      const gaps = cleanGaps(text.split("\n"));
      const { error } = await db
        .from("households")
        .update({ known_gaps: gaps })
        .eq("id", household.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(
        gaps.length
          ? "The advisor will say these figures are incomplete"
          : "No gaps recorded — the advisor treats what is on file as the whole picture",
      );
    } catch (error) {
      toast.error("That could not be saved", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="What the records are missing"
      description="One per line. The advisor repeats these back and refuses to state a spending baseline, savings rate or runway as fact while any of them stand. Accounts with no stated balance are added automatically."
    >
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={!isOwner}
        rows={4}
        placeholder={"Nothing before January 2024 is imported\nHaya's Egyptian account is not exported anywhere"}
        className="text-sm"
      />
      {isOwner && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            Save
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}
