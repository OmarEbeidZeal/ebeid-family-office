import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";

export function ScopeToggle() {
  const { profile, members } = useAuth();
  const { scope, setScope } = useScope();

  const options = [
    { value: profile?.id ?? "me", label: "Me" },
    ...members
      .filter((member) => member.id !== profile?.id)
      .map((member) => ({
        value: member.id,
        label: member.display_name ?? member.full_name ?? "Partner",
      })),
    { value: "household", label: "Household" },
  ];

  return (
    <div className="hairline inline-flex rounded-lg bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setScope(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            scope === option.value
              ? "bg-gold-soft text-gold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
