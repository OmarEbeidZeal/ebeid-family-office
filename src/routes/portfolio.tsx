import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Ebeid Family Office" },
      {
        name: "description",
        content: "Listed holdings, cost basis and concentration risk across the household.",
      },
      { property: "og:title", content: "Portfolio — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Listed holdings, cost basis and concentration risk across the household.",
      },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  return (
    <AppShell
      title="Portfolio"
      description="Listed holdings, cost basis, position sizing and concentration — priced from real market data."
    >
      <ComingSoon
        headline="Live market data arrives in the next build"
        body="Holdings are already in the schema. What is missing is a price feed, and the platform will not show a position value it cannot price honestly."
        bullets={[
          "Daily price snapshots per ticker, with the as-of time shown next to every figure",
          "Cost basis, unrealised gain and weight of each position in the household",
          "Concentration limits: any single name flagged against a capped satellite sleeve",
          "Watchlist with thesis, conviction and the price that would falsify it",
          "CGT-aware disposal view against the £3,000 annual exempt amount",
        ]}
        requires="Private company shareholdings are deliberately excluded from this page — they live on the balance sheet as illiquid holdings and are never counted as spendable wealth."
      />
    </AppShell>
  );
}
