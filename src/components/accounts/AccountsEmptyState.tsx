import { Link } from "@tanstack/react-router";
import { FileUp, Landmark, Plus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

/**
 * The page's whole framing in one panel: statements produce accounts, and
 * typing one in is for the handful of accounts no statement can reach.
 */
export function AccountsEmptyState({ onAddManually }: { onAddManually: () => void }) {
  return (
    <EmptyState
      icon={<Landmark className="h-4 w-4" />}
      title="Your accounts come from your statements"
      body="Upload a statement and your accounts appear here. The institution, account number, currency and type are read from the statement itself — you confirm what was found rather than typing it in."
      action={
        <div className="flex flex-col items-center gap-3">
          <Button size="sm" asChild>
            <Link to="/import">
              <FileUp className="size-3.5" />
              Import statements
            </Link>
          </Button>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Some accounts have no statement to export — cash, a crypto wallet, a workplace pension,
            a foreign account your bank won't export. Those you enter by hand.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={onAddManually}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add one manually
          </Button>
        </div>
      }
    />
  );
}
