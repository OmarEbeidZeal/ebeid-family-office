import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CategoryRow } from "@/hooks/useFinancials";

export function CategoryCombobox({
  value,
  categories,
  onChange,
  placeholder = "Uncategorised",
  className,
  disabled,
}: {
  value: string | null;
  categories: CategoryRow[];
  onChange: (categoryId: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();
    for (const category of categories) {
      const list = map.get(category.category_group) ?? [];
      list.push(category);
      map.set(category.category_group, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [categories]);

  const selected = categories.find((category) => category.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-1 rounded border border-transparent px-1.5 py-1 text-left text-xs transition-colors hover:border-border hover:bg-surface-raised focus:outline-none focus-visible:border-border disabled:cursor-not-allowed disabled:opacity-60",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected?.name ?? placeholder}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-40" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find a category" className="h-9 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty className="px-3 py-4 text-xs text-muted-foreground">
              No category with that name.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="uncategorised"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-xs"
              >
                <Check className={cn("size-3", value ? "opacity-0" : "opacity-100")} />
                Uncategorised
              </CommandItem>
            </CommandGroup>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={`${category.name} ${group}`}
                    onSelect={() => {
                      onChange(category.id);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn("size-3", value === category.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{category.name}</span>
                    {category.is_essential && (
                      <span className="ml-auto text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                        essential
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
