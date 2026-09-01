import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { shariahLabel, type ShariahStatus } from "@/lib/mandates";

/**
 * Records the household's own Shariah determination against a holding or a
 * watchlist idea. Nothing is screened for them: this writes down what a person
 * decided, and every surface reads it back unchanged.
 */
export function useSetShariahStatus(table: "holdings" | "watchlist") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: ShariahStatus;
      ticker?: string;
    }) => {
      const { error } = await db.from(table).update({ shariah_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [table] });
      toast.success(
        variables.ticker
          ? `${variables.ticker} marked ${shariahLabel(variables.status).toLowerCase()}`
          : `Marked ${shariahLabel(variables.status).toLowerCase()}`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
