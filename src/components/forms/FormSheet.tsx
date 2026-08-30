import type { FormEventHandler, ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Every add/edit flow in the app is a right-hand sheet: the ledger behind it
 * stays visible while a figure is being entered.
 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  pending,
  submitLabel,
  footerNote,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending?: boolean;
  submitLabel: string;
  footerNote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle className="text-base font-light tracking-tight">{title}</SheetTitle>
          {description && (
            <SheetDescription className="text-xs leading-relaxed">{description}</SheetDescription>
          )}
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
            {footerNote && (
              <p className="mt-5 rounded-md border border-border bg-surface-raised px-3 py-2.5 text-[0.7rem] leading-relaxed text-muted-foreground">
                {footerNote}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Full-width row inside the sheet's two-column grid. */
export function FullRow({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}
