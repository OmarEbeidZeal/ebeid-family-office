import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useQueueImport, type UploadProgress } from "@/hooks/useImports";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.csv,.xls,.xlsx,.txt";
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 40;

/**
 * The whole import, in one gesture: drop the files in. Nothing is asked about
 * accounts here — the reader works that out, and the review list below asks
 * only where it genuinely could not tell.
 */
export function ImportDropzone({ onQueued }: { onQueued?: (batchId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const queueImport = useQueueImport();

  const send = async (list: FileList | File[]) => {
    const chosen = Array.from(list);
    if (!chosen.length) return;

    const tooBig = chosen.filter((file) => file.size > MAX_BYTES);
    const files = chosen.filter((file) => file.size <= MAX_BYTES).slice(0, MAX_FILES);

    if (tooBig.length) {
      toast.error(`${tooBig.length} file${tooBig.length === 1 ? " is" : "s are"} over 20MB`, {
        description: tooBig.map((file) => file.name).join(", "),
      });
    }
    if (chosen.length > MAX_FILES) {
      toast.message(`Taking the first ${MAX_FILES} files`, {
        description: "Drop the rest once these are read — the queue keeps going on its own.",
      });
    }
    if (!files.length) return;

    setProgress(files.map((file) => ({ name: file.name, state: "uploading" as const })));

    try {
      const result = await queueImport.mutateAsync({
        files,
        onProgress: (update) =>
          setProgress((current) => current.map((row) => (row.name === update.name ? update : row))),
      });

      toast.success(`${result.uploaded} file${result.uploaded === 1 ? "" : "s"} queued`, {
        description: "Reading starts now and continues even if you close this tab.",
      });
      if (result.rejected.length) {
        toast.error(`${result.rejected.length} could not be uploaded`, {
          description: result.rejected.map((row) => row.name).join(", "),
        });
      }
      onQueued?.(result.batchId);
      setProgress([]);
    } catch (error) {
      toast.error("That import could not be queued", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
      setProgress([]);
    }
  };

  const busy = queueImport.isPending;

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) void send(event.dataTransfer.files);
        }}
        className={cn(
          "hairline rounded-lg bg-surface px-6 py-10 text-center transition-colors",
          dragging && "border-gold bg-gold-soft",
        )}
      >
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-gold">
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileUp className="size-4" strokeWidth={1.5} />
          )}
        </div>
        <p className="text-sm font-medium text-foreground">
          {busy ? "Uploading…" : "Drop statements here"}
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          PDF, CSV or Excel, up to 20MB each and 40 at a time. No need to say which account each one
          is — the reader identifies the bank, the holder and the last four digits, then asks only
          when it cannot tell.
        </p>
        <div className="mt-5 flex justify-center">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="min-h-11"
          >
            Choose files
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void send(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {progress.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {progress.map((row) => (
            <li
              key={row.name}
              className="hairline flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-xs"
            >
              <span className="truncate text-foreground">{row.name}</span>
              <span
                className={cn(
                  "shrink-0 text-muted-foreground",
                  row.state === "error" && "text-loss",
                  row.state === "done" && "text-gain",
                )}
              >
                {row.state === "uploading"
                  ? "Uploading"
                  : row.state === "done"
                    ? "Queued"
                    : "Failed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
