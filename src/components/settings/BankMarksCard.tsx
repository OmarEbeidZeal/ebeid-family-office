import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Info } from "lucide-react";
import { BankMark } from "@/components/BankMark";
import { SettingsCard } from "./SettingsCard";
import { bankLogosAvailable } from "@/lib/bank-logos";
import { BANKS } from "@/lib/ai/banks";
import { cn } from "@/lib/utils";

const SAMPLE = ["HSBC UK", "Starling Bank", "Commercial International Bank", "Arab Bank"];

/**
 * Bank marks are cosmetic, so this card says plainly whether they are on and
 * what turns them on — it never pretends a monogram is a logo.
 */
export function BankMarksCard() {
  const { data: available, isLoading } = useQuery({
    queryKey: ["bank-logos", "availability"],
    queryFn: () => bankLogosAvailable(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <SettingsCard
      title="Bank marks"
      description={`Accounts and statements carry their bank's logo, matched from the institution name a statement prints. ${BANKS.length} UK, Egyptian, Jordanian, Gulf and US banks and brokers are recognised.`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {SAMPLE.map((name) => (
            <span key={name} className="flex items-center gap-2">
              <BankMark institution={name} size={28} />
              <span className="text-xs text-muted-foreground">{name}</span>
            </span>
          ))}
        </div>

        {isLoading ? null : available ? (
          <p className="flex items-start gap-2 rounded-md border border-gain/30 bg-gain/10 px-3 py-2.5 text-xs leading-relaxed text-gain">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Logos are live. Marks are fetched through this app so the logo provider never sees who
              is looking, and are cached for a week.
            </span>
          </p>
        ) : (
          <p
            className={cn(
              "flex items-start gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5",
              "text-xs leading-relaxed text-muted-foreground",
            )}
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Every bank is showing its initials. Add a{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 text-[0.7rem] text-foreground/85">
                LOGODEV_TOKEN
              </code>{" "}
              secret in Project Settings to switch on real logos — nothing else changes, and no
              account data ever leaves the app to fetch one.
            </span>
          </p>
        )}
      </div>
    </SettingsCard>
  );
}
