import type { ReactNode } from "react";

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground/80">{description}</p>}
      </div>
      {action}
    </div>
  );
}
