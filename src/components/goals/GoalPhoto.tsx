import { useGoalImageUrl } from "@/hooks/useGoalImage";
import { cn } from "@/lib/utils";

/**
 * A goal's photograph, fetched through a short-lived signed URL and always
 * behind a scrim heavy enough that the figures on top stay readable in either
 * theme. Decorative: the card says everything the picture does.
 */
export function GoalPhoto({ path, className }: { path: string | null; className?: string }) {
  const { data: url } = useGoalImageUrl(path);
  if (!path || !url) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <img
        src={url}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="h-full w-full object-cover opacity-60"
      />
      <div className="photo-scrim absolute inset-0" />
    </div>
  );
}
