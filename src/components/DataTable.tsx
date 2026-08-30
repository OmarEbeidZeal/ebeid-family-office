import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  rowCount = 4,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  rowCount?: number;
  empty?: ReactNode;
}) {
  if (loading) {
    return (
      <div className="hairline overflow-hidden rounded-lg bg-surface">
        {Array.from({ length: rowCount }).map((_, index) => (
          <div key={index} className="flex items-center justify-between border-b px-4 py-4 last:border-b-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div className="hairline overflow-x-auto rounded-lg bg-surface">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-4 py-3 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-muted-foreground",
                  column.align === "right" ? "text-right" : "text-left",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-b-0 hover:bg-surface-raised">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle",
                    column.align === "right" ? "text-right" : "text-left",
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
