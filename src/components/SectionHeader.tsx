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
        <h2 className="eyebrow text-foreground/70">{title}</h2>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
