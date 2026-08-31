import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, SelectNative } from "@/components/forms/FormField";
import { supabase } from "@/integrations/supabase/client";
import { useOwners } from "@/hooks/useOwners";

/**
 * Getting ownership wrong on the first pass is expected — this makes fixing it
 * cost one action rather than twenty. It says what will move before it moves.
 */
export function ReassignOwnerDialog({
  open,
  onOpenChange,
  accountIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountIds: string[];
  onDone?: (() => void) | undefined;
}) {
  const { options, nameOf } = useOwners();
  const queryClient = useQueryClient();
  const [owner, setOwner] = useState("");

  useEffect(() => {
    if (open) setOwner("");
  }, [open]);

  // What actually moves with the accounts.
  const { data: transactionCount } = useQuery({
    queryKey: ["reassign-scope", accountIds],
    enabled: open && accountIds.length > 0,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .in("account_id", accountIds);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const reassign = useMutation({
    mutationFn: async () => {
      if (!owner) throw new Error("Choose who these accounts belong to");
      const { error } = await supabase
        .from("accounts")
        .update(
          owner === "joint"
            ? { is_joint: true, owner_profile_id: null }
            : { is_joint: false, owner_profile_id: owner },
        )
        .in("id", accountIds);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success(
        `${accountIds.length} ${accountIds.length === 1 ? "account" : "accounts"} moved to ${nameOf(
          owner === "joint" ? null : owner,
          owner === "joint",
        )}`,
      );
      onOpenChange(false);
      onDone?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const plural = accountIds.length === 1 ? "account" : "accounts";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign owner</DialogTitle>
          <DialogDescription>
            {accountIds.length} {plural}
            {typeof transactionCount === "number" && (
              <>
                {" and "}
                {transactionCount.toLocaleString()}{" "}
                {transactionCount === 1 ? "transaction" : "transactions"}
              </>
            )}{" "}
            will move. Balances and history are untouched — only whose they are changes.
          </DialogDescription>
        </DialogHeader>

        <Field label="New owner">
          <SelectNative
            value={owner}
            onChange={setOwner}
            options={[{ value: "", label: "Choose a person…" }, ...options]}
          />
        </Field>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => reassign.mutate()}
            disabled={!owner || reassign.isPending || !accountIds.length}
          >
            {reassign.isPending ? "Moving…" : `Move ${accountIds.length} ${plural}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
