import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useSecurityDetail } from "@/hooks/useMarketData";
import { formatCompact, formatDate, formatPercent, relativeTime } from "@/lib/format";
import { MISSING_KEY_MESSAGE } from "@/components/portfolio/MarketDataBanner";
import type { ProviderMetrics } from "@/lib/market/shared";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised/40 px-3 py-2.5">
      <p className="eyebrow mb-1">{label}</p>
      <p className="num text-sm text-foreground">{value}</p>
    </div>
  );
}

function metricRows(metrics: ProviderMetrics | null, currency: string | null) {
  if (!metrics) return [];
  const money = (value: number | null) =>
    value === null ? null : `${currency === "USD" ? "$" : ""}${value.toFixed(2)}`;
  const pct = (value: number | null) => (value === null ? null : formatPercent(value));
  const num = (value: number | null) => (value === null ? null : value.toFixed(2));

  return [
    { label: "52-week high", value: money(metrics.week52High) },
    { label: "52-week low", value: money(metrics.week52Low) },
    { label: "Beta", value: num(metrics.beta) },
    { label: "Price / sales", value: num(metrics.priceToSales) },
    { label: "Price / earnings", value: num(metrics.priceToEarnings) },
    { label: "Gross margin", value: pct(metrics.grossMarginPct) },
    { label: "Net margin", value: pct(metrics.netMarginPct) },
    { label: "Revenue growth", value: pct(metrics.revenueGrowthPct) },
    { label: "Dividend yield", value: pct(metrics.dividendYieldPct) },
  ].filter((row): row is { label: string; value: string } => row.value !== null);
}

/** Company profile, fundamentals and headlines — provider data only, never inferred. */
export function SecurityDetailSheet({
  ticker,
  onOpenChange,
}: {
  ticker: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useSecurityDetail(ticker);
  const data = detail.data;
  const profile = data?.profile ?? null;
  const rows = metricRows(data?.metrics ?? null, profile?.currency ?? null);

  return (
    <Sheet open={!!ticker} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle className="num text-base font-light tracking-tight">
            {ticker}
            {profile?.name ? (
              <span className="ml-2 text-muted-foreground">{profile.name}</span>
            ) : null}
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            {profile
              ? [profile.exchange, profile.industry, profile.country].filter(Boolean).join(" · ")
              : "Company profile, fundamentals and recent headlines from the market-data provider."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-5">
          {detail.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : data?.configured === false ? (
            <p className="rounded-md border border-warn/40 bg-warn-soft px-3.5 py-3 text-xs leading-relaxed text-warn">
              {MISSING_KEY_MESSAGE}
            </p>
          ) : (
            <>
              {data?.message && (
                <p className="rounded-md border border-border bg-surface-raised px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                  {data.message}
                </p>
              )}

              {profile && (
                <section>
                  <p className="eyebrow mb-2.5">Company</p>
                  <div className="grid grid-cols-2 gap-2">
                    {profile.marketCap !== null && (
                      <Metric
                        label="Market cap"
                        value={formatCompact(profile.marketCap, profile.currency ?? "USD")}
                      />
                    )}
                    {profile.ipo && <Metric label="Listed" value={formatDate(profile.ipo)} />}
                  </div>
                  {profile.website && (
                    <Button asChild variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs">
                      <a href={profile.website} target="_blank" rel="noreferrer noopener">
                        {profile.website.replace(/^https?:\/\//, "")}
                        <ExternalLink className="ml-1.5 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  {data?.profileAsOf && (
                    <p className="mt-2 text-[0.7rem] text-muted-foreground">
                      Profile as of {relativeTime(data.profileAsOf)}
                    </p>
                  )}
                </section>
              )}

              {rows.length > 0 && (
                <section>
                  <p className="eyebrow mb-2.5">Fundamentals</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {rows.map((row) => (
                      <Metric key={row.label} label={row.label} value={row.value} />
                    ))}
                  </div>
                  {data?.metricsAsOf && (
                    <p className="mt-2 text-[0.7rem] text-muted-foreground">
                      As of {relativeTime(data.metricsAsOf)}
                    </p>
                  )}
                </section>
              )}

              <section>
                <p className="eyebrow mb-2.5">Recent headlines</p>
                {!data?.news?.length ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    No headlines returned for this ticker in the last two weeks.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.news.slice(0, 8).map((item) => (
                      <li key={`${item.publishedAt}-${item.headline}`}>
                        <a
                          href={item.url ?? "#"}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm leading-snug text-foreground/90 transition-colors hover:text-gold"
                        >
                          {item.headline}
                        </a>
                        <p className="mt-1 text-[0.7rem] text-muted-foreground">
                          {[item.source, relativeTime(item.publishedAt)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {!profile && !rows.length && !data?.news?.length && !data?.message && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The provider returned nothing for this ticker. Check the symbol matches the
                  exchange listing — London lines usually need a .L suffix.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
