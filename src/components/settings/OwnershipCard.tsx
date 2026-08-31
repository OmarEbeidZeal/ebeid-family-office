import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsCard } from "./SettingsCard";
import { ReassignOwnerDialog } from "@/components/accounts/ReassignOwnerDialog";
import { useAccounts } from "@/hooks/useFinancials";
import { useOwners } from "@/hooks/useOwners";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Who owns what, in one list. Omar uploads everything, so a good deal of it
 * will be assigned to the wrong person the first time round.
 */
export function OwnershipCard() {
  const { data: accounts = [] } = useAccounts();
  const { profile } = useAuth();
  const { nameOf } = useOwners();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [reassigning, setReassigning] = useState(false);

  const rows = useMemo(
    () =>
      accounts
        .filter((account) => account.is_active)
        .slice()
        .sort((a, b) => nameOf(a.owner_profile_id, a.is_joint).localeCompare(
          nameOf(b.owner_profile_id, b.is_joint),
        ) || a.nickname.localeCompare(b.nickname)),
    [accounts, nameOf],
  );

  const toggleVisibility = useMutation({
    mutationFn: async (account: { id: string; visibility: string; owner_profile_id: string | null }) => {
      const next = account.visibility === "private" ? "household" : "private";
      if (next === "private" && !account.owner_profile_id) {
        throw new Error("A private account needs a single owner — it cannot be joint");
      }
      const { error } = await supabase
        .from("accounts")
        .update({ visibility: next })
        .eq("id", account.id);
      if (error) throw error;
      return next;
    },
    onSuccess: async (next) => {
      await queryClient.invalidateQueries();
      toast.success(
        next === "private"
          ? "Private — only the owner sees this account, and it is out of the other person's totals"
          : "Shared with the household again",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <SettingsCard
      title="Account ownership"
      description="An account's owner is a decision, not a side effect of who uploaded the statement. Select several to move them at once."
    >
      {!rows.length ? (
        <p className="text-xs text-muted-foreground">No open accounts yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(allSelected ? [] : rows.map((row) => row.id))}
            >
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            <Button
              size="sm"
              variant={selected.length ? "default" : "ghost"}
              disabled={!selected.length}
              onClick={() => setReassigning(true)}
            >
              Reassign {selected.length || ""}
            </Button>
          </div>

          <ul className="mt-3 divide-y divide-border">
            {rows.map((account) => {
              const isPrivate = account.visibility === "private";
              const mine = account.owner_profile_id === profile?.id;
              return (
                <li key={account.id} className="flex items-center gap-3 py-2.5">
                  <Checkbox
                    checked={selected.includes(account.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, account.id]
                          : current.filter((id) => id !== account.id),
                      )
                    }
                    aria-label={`Select ${account.nickname}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{account.nickname}</p>
                    <p className="text-[0.7rem] text-muted-foreground">
                      {nameOf(account.owner_profile_id, account.is_joint)}
                      {account.institution && (
                        <>
                          <span className="mx-1.5 text-border">·</span>
                          {account.institution}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatCompact(Number(account.current_balance), account.currency)}
                  </span>
                  <button
                    type="button"
                    title={
                      isPrivate
                        ? "Private — only the owner sees it"
                        : "Shared with the household"
                    }
                    aria-label={isPrivate ? "Make visible to the household" : "Make private"}
                    disabled={!mine && isPrivate}
                    onClick={() =>
                      toggleVisibility.mutate({
                        id: account.id,
                        visibility: account.visibility,
                        owner_profile_id: account.owner_profile_id,
                      })
                    }
                    className={cn(
                      "shrink-0 rounded p-1.5 transition-colors",
                      isPrivate
                        ? "text-warning hover:text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isPrivate ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-[0.7rem] text-muted-foreground">
            A private account is hidden from the other person entirely, including their household
            total — so the figure they see always matches the rows they can see.
          </p>
        </>
      )}

      <ReassignOwnerDialog
        open={reassigning}
        onOpenChange={setReassigning}
        accountIds={selected}
        onDone={() => setSelected([])}
      />
    </SettingsCard>
  );
}
