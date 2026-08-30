import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, Loader2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "./SettingsCard";
import { testMarketData } from "@/lib/market-data.functions";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Market data status, provable rather than asserted: the test hits the
 * provider with a real symbol and reports exactly what came back.
 */
export function MarketDataCard() {
  const run = useServerFn(testMarketData);
  const test = useMutation({ mutationFn: () => run() });
  const result = test.data;

  const tone = !result
    ? null
    : result.ok
      ? { icon: CheckCircle2, className: "border-gain/30 bg-gain/10 text-gain" }
      : { icon: CircleAlert, className: "border-warn/40 bg-warn-soft text-warn" };
  const Icon = tone?.icon;

  return (
    <SettingsCard
      title="Market data"
      description="Live prices for listed holdings and the watchlist come from Finnhub, cached for 60 seconds so a portfolio refresh never exhausts the free tier."
      action={
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="mr-1.5 h-3.5 w-3.5" />
          )}
          {test.isPending ? "Testing…" : "Test connection"}
        </Button>
      }
    >
      <div className="space-y-3">
        {result && tone && Icon ? (
          <div className={cn("rounded-md border px-3 py-2.5 text-xs leading-relaxed", tone.className)}>
            <p className="flex items-start gap-2">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{result.message}</span>
            </p>
            {result.sample && (
              <p className="num mt-2 pl-5.5 text-[0.7rem] opacity-90">
                {result.sample.ticker} {result.sample.price.toFixed(2)} USD · priced {relativeTime(result.sample.asOf)}
              </p>
            )}
          </div>
        ) : test.error ? (
          <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2.5 text-xs text-loss">
            {(test.error as Error).message}
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Test the connection to confirm the key is live. Prices are never estimated: if the
            provider cannot be reached, the portfolio shows the holding unpriced and says why.
          </p>
        )}

        <div className="hairline rounded-md bg-surface-raised px-3 py-2.5">
          <p className="eyebrow text-muted-foreground">Key</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/85">
            The key is held as the <span className="num">FINNHUB_API_KEY</span> secret in Project
            Settings → Secrets, never in the browser. A free key from finnhub.io is enough for this
            household's number of holdings.
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}
