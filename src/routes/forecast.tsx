import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Forecast — Ebeid Family Office" },
      {
        name: "description",
        content: "Cashflow projection, goal funding and scenario modelling for the household.",
      },
      { property: "og:title", content: "Forecast — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Cashflow projection, goal funding and scenario modelling.",
      },
    ],
  }),
  component: ForecastPage,
});

function ForecastPage() {
  return (
    <AppShell
      title="Forecast"
      description="Where the money goes over the next decade — and what has to be true for each goal to land."
    >
      <ComingSoon
        headline="Projection and scenarios arrive in the next build"
        body="Your income streams, committed outgoings and goals are already stored. The forecast engine turns them into a month-by-month projection you can stress."
        bullets={[
          "Month-by-month liquid cash projection with inflation applied per expense line",
          "Goal funding: which goals are covered, which slip, and by how long",
          "Scenario comparison against a baseline — a house purchase, a liquidity event, a currency shock",
          "UK tax wrapper capacity: ISA £20,000, pension £60,000 annual allowance and taper",
          "Use-it-or-lose-it prompts before 5 April, including the cash ISA change from April 2027",
        ]}
        requires="Nothing here will be modelled from assumed figures. Every projection starts from numbers you entered."
      />
    </AppShell>
  );
}
