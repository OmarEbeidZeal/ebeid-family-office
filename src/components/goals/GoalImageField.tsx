import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGoalImageUrl, uploadGoalImage } from "@/hooks/useGoalImage";
import { useAuth } from "@/hooks/useAuth";

/**
 * An optional photograph for a goal — the flat, the house, the room. Stored in
 * the household's private bucket and only ever read through a signed link.
 */
export function GoalImageField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const { household } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const preview = useGoalImageUrl(value);

  const pick = async (file: File | undefined) => {
    if (!file || !household?.id) return;
    setUploading(true);
    try {
      const path = await uploadGoalImage(file, household.id);
      onChange(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="hairline rounded-md bg-surface-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Photograph</p>
          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            Optional. Sits behind the goal card so the number has a face. Private to the household —
            never published.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0"
          disabled={uploading || !household?.id}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {value ? "Replace" : "Add photo"}
        </Button>
      </div>

      {value && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
            {preview.data ? (
              <img
                src={preview.data}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[0.65rem] text-muted-foreground">
                {preview.isLoading ? "Loading" : "Preview unavailable"}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 text-muted-foreground"
            onClick={() => onChange(null)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}
