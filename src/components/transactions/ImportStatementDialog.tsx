import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectNative } from "@/components/forms/FormField";
import { AccountSheet } from "@/components/forms/AccountSheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts } from "@/hooks/useFinancials";
import { parseStatement } from "@/lib/statements.functions";
import { ACCOUNT_TYPE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = [".pdf", ".csv", ".tsv", ".txt", ".xls", ".xlsx", ".xlsm"];

type ItemStatus = "ready" | "uploading" | "parsing" | "parsed" | "needs_review" | "failed";

type Item = {
  key: string;
  file: File;
  accountId: string;
  status: ItemStatus;
  statementId: string | null;
  message: string;
};

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  ready: "Ready",
  uploading: "Uploading",
  parsing: "Reading",
  parsed: "Imported",
  needs_review: "Needs review",
  failed: "Failed",
};

export function ImportStatementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { household, profile } = useAuth();
  const { data: accounts } = useAccounts();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  /** Which queued file asked for a brand-new account, so it can be selected on save. */
  const awaitingAccountFor = useRef<string | null>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  const activeAccounts = (accounts ?? []).filter((account) => account.is_active);
  const defaultAccountId = activeAccounts[0]?.id ?? "";

  const patch = useCallback((key: string, values: Partial<Item>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...values } : item)),
    );
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const next: Item[] = [];
      for (const file of Array.from(files)) {
        if (!ACCEPTED.includes(extensionOf(file.name))) {
          toast.error(`${file.name} isn't a PDF, CSV or Excel file.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is over the 20MB limit.`);
          continue;
        }
        next.push({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          accountId: defaultAccountId,
          status: "ready",
          statementId: null,
          message: "",
        });
      }
      if (next.length) setItems((current) => [...current, ...next]);
    },
    [defaultAccountId],
  );

  /** A newly created account is selected for the file that asked for it, and for
   * anything still waiting on an account of any kind. */
  const onAccountCreated = useCallback((id: string) => {
    const requestedFor = awaitingAccountFor.current;
    awaitingAccountFor.current = null;
    setItems((current) =>
      current.map((item) =>
        item.key === requestedFor || !item.accountId ? { ...item, accountId: id } : item,
      ),
    );
  }, []);

  const runOne = useCallback(
    async (item: Item) => {
      if (!household) return;
      // A file queued before any account existed falls back to the first account
      // rather than failing on a selection the user was never offered.
      const accountId = item.accountId || defaultAccountId;
      if (!accountId) {
        patch(item.key, {
          status: "failed",
          message: "Choose the account this statement belongs to.",
        });
        return;
      }
      if (accountId !== item.accountId) patch(item.key, { accountId });

      let statementId = item.statementId;

      try {
        if (!statementId) {
          patch(item.key, { status: "uploading", message: "" });
          const safeName = item.file.name.replace(/[^\w.-]+/g, "_").slice(-80);
          const path = `${household.id}/${accountId}/${crypto.randomUUID()}-${safeName}`;

          const { error: uploadError } = await supabase.storage
            .from("statements")
            .upload(path, item.file, {
              contentType: item.file.type || "application/octet-stream",
              upsert: false,
            });
          if (uploadError) throw new Error(uploadError.message);

          const { data: statement, error: insertError } = await supabase
            .from("statements")
            .insert({
              household_id: household.id,
              account_id: accountId,
              uploaded_by: profile?.id ?? null,
              file_path: path,
              file_name: item.file.name,
              file_size: item.file.size,
              status: "uploaded",
            })
            .select("id")
            .single();
          if (insertError) throw new Error(insertError.message);

          statementId = statement.id;
          patch(item.key, { statementId });
        }

        patch(item.key, { status: "parsing", message: "" });
        const result = await parseStatement({ data: { statementId: statementId! } });

        patch(item.key, {
          status: result.status === "failed" ? "failed" : result.status,
          message:
            result.status === "failed"
              ? result.message
              : [result.message, ...result.notes].filter(Boolean).join(" · "),
        });
      } catch (error) {
        patch(item.key, {
          status: "failed",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    },
    [defaultAccountId, household, patch, profile?.id],
  );

  const runAll = useCallback(async () => {
    setRunning(true);
    // Sequential: each import does real work server-side, and a queue keeps the
    // status list honest about what is happening right now. The ref is read on
    // every pass so a statement id written by an earlier attempt is picked up.
    const queue = itemsRef.current.map((item) => item.key);
    for (const key of queue) {
      const current = itemsRef.current.find((item) => item.key === key);
      if (!current) continue;
      if (current.status === "parsed" || current.status === "needs_review") continue;

      await runOne(current);
    }
    setRunning(false);
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["statements"] });
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }, [queryClient, runOne]);

  const pending = items.filter(
    (item) => item.status !== "parsed" && item.status !== "needs_review",
  ).length;

  const close = (next: boolean) => {
    if (!next && running) return;
    if (!next) setItems([]);
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-5 text-left">
            <DialogTitle className="text-base font-light tracking-tight">
              Import statements
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              PDF, CSV or Excel, up to 20MB each. Files stay private to this household, and
              re-importing the same statement never doubles a transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
            {!activeAccounts.length ? (
              <div className="rounded border border-border bg-surface-raised p-4 text-xs leading-relaxed text-muted-foreground">
                Add an account first — a statement has to belong to one.
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => setAccountSheetOpen(true)}>
                    <Plus className="size-3" /> New account
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border px-6 py-10 text-center transition-colors",
                    dragging ? "border-gold-line bg-gold-soft" : "hover:border-muted-foreground/40",
                  )}
                >
                  <Upload className="size-5 text-muted-foreground" />
                  <p className="text-xs text-foreground">Drop statements here, or browse</p>
                  <p className="text-[0.7rem] text-muted-foreground">
                    Several at once is fine — UK, Egyptian, Jordanian and US formats are all read.
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED.join(",")}
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.length) addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>

                {items.length > 0 && (
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li
                        key={item.key}
                        className="rounded border border-border bg-surface-raised px-3 py-2.5"
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs text-foreground">{item.file.name}</p>
                              <span className="num shrink-0 text-[0.7rem] text-muted-foreground">
                                {formatSize(item.file.size)}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <div className="w-52">
                                <SelectNative
                                  value={item.accountId}
                                  disabled={item.status !== "ready" && item.status !== "failed"}
                                  onChange={(value) => {
                                    if (value === "__new") {
                                      awaitingAccountFor.current = item.key;
                                      setAccountSheetOpen(true);

                                      return;
                                    }
                                    patch(item.key, { accountId: value });
                                  }}
                                  options={[
                                    ...activeAccounts.map((account) => ({
                                      value: account.id,
                                      label: `${account.nickname} · ${ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type} · ${account.currency}`,
                                    })),
                                    { value: "__new", label: "+ New account…" },
                                  ]}
                                />
                              </div>

                              <StatusPill status={item.status} />

                              {(item.status === "failed" || item.status === "needs_review") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[0.7rem]"
                                  disabled={running}
                                  onClick={() => void runOne(item)}
                                >
                                  Try again
                                </Button>
                              )}
                            </div>

                            {item.message && (
                              <p
                                className={cn(
                                  "mt-2 text-[0.7rem] leading-relaxed",
                                  item.status === "failed" ? "text-loss" : "text-muted-foreground",
                                )}
                              >
                                {item.message}
                              </p>
                            )}
                          </div>

                          {item.status === "ready" && (
                            <button
                              type="button"
                              aria-label={`Remove ${item.file.name}`}
                              className="text-muted-foreground transition-colors hover:text-foreground"
                              onClick={() =>
                                setItems((current) =>
                                  current.filter((entry) => entry.key !== item.key),
                                )
                              }
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <p className="text-[0.7rem] text-muted-foreground">
              {items.length
                ? `${items.length} file${items.length === 1 ? "" : "s"}, ${pending} to import`
                : "Nothing queued yet"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={running} onClick={() => close(false)}>
                {items.some((item) => item.status === "parsed" || item.status === "needs_review")
                  ? "Done"
                  : "Cancel"}
              </Button>
              <Button size="sm" disabled={!pending || running} onClick={() => void runAll()}>
                {running && <Loader2 className="size-3 animate-spin" />}
                Import {pending > 0 ? pending : ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AccountSheet
        open={accountSheetOpen}
        onOpenChange={(next) => {
          if (!next) awaitingAccountFor.current = null;
          setAccountSheetOpen(next);
        }}
        onSaved={onAccountCreated}
      />
    </>
  );
}

function StatusPill({ status }: { status: ItemStatus }) {
  const busy = status === "uploading" || status === "parsing";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] uppercase tracking-wider",
        status === "parsed" && "border-gain/30 text-gain",
        status === "needs_review" && "border-warn/40 text-warn",
        status === "failed" && "border-loss/40 text-loss",
        busy && "border-gold-line text-gold",
        status === "ready" && "border-border text-muted-foreground",
      )}
    >
      {busy && <Loader2 className="size-2.5 animate-spin" />}
      {status === "parsed" && <CheckCircle2 className="size-2.5" />}
      {status === "needs_review" && <AlertTriangle className="size-2.5" />}
      {status === "failed" && <AlertTriangle className="size-2.5" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
