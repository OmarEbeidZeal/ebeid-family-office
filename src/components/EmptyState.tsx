import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Empty states name exactly what is missing and what to add. The system never
 * fills a gap with an invented figure.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("hairline rounded-lg bg-surface px-6 py-10 text-center", className)}>
      {icon && (
        <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-gold">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
