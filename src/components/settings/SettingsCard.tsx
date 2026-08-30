import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("hairline rounded-lg bg-surface p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}
