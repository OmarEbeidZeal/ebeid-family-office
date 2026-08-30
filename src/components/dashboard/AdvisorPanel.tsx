import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

type Note = { id: string; title: string; body: string | null; severity: string; generated_at: string };

export function AdvisorPanel() {
  const { household } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["advisor_notes", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("advisor_notes")
        .select("id, title, body, severity, generated_at")
        .eq("household_id", household!.id)
        .order("generated_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (rows ?? []) as Note[];
    },
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-lg" />;

  if (!data?.length) {
    return (
      <div className="hairline rounded-lg bg-surface p-5">
        <p className="text-sm font-medium">Advisor briefing</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your daily briefing will appear here once the advisor is switched on in the next phase. It
          will read your live balance sheet, cashflow and currency exposure and flag what actually
          needs a decision this week.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((note) => (
        <div key={note.id} className="hairline rounded-lg bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{note.title}</p>
            <span className="text-[0.65rem] uppercase tracking-[0.12em] text-gold">
              {note.severity}
            </span>
          </div>
          {note.body && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{note.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}
