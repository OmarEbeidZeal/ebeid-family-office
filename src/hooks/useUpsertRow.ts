import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "./useAuth";

type Payload = Record<string, unknown>;

export function useSaveRow(table: string, queryKey: string, label: string) {
  const { household } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, values }: { id?: string | undefined; values: Payload }) => {
      if (id) {
        const { error } = await db.from(table).update(values).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await db
        .from(table)
        .insert({ ...values, household_id: household!.id })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string } | null)?.id ?? null;
    },

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success(variables.id ? `${label} updated` : `${label} added`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteRow(table: string, queryKey: string, label: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${label} deleted`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
