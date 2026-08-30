import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Payload = Record<string, unknown>;

export function useSaveRow(table: string, queryKey: string, label: string) {
  const { household } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, values }: { id?: string | undefined; values: Payload }) => {
      if (id) {
        const { error } = await supabase.from(table).update(values).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from(table)
        .insert({ ...values, household_id: household!.id });
      if (error) throw error;
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
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${label} deleted`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
