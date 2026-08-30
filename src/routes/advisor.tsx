import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/advisor")({
  head: () => ({
    meta: [
      { title: "Advisor — Ebeid Family Office" },
      {
        name: "description",
        content: "Grounded portfolio briefings and planning conversation for the Ebeid household.",
      },
      { property: "og:title", content: "Advisor — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Grounded portfolio briefings and planning conversation.",
      },
    ],
  }),
  component: AdvisorPage,
});

function AdvisorPage() {
  return (
    <AppShell
      title="Advisor"
      description="A wealth manager's discipline applied to your actual numbers — never a stock tipster."
    >
      <ComingSoon
        headline="The advisor activates once there is something real to advise on"
        body="It will read your stored balances, holdings, goals and timelines, and reason only from those. It will not quote a price it cannot verify, and it will not present output as regulated advice."
        bullets={[
          "Morning briefing grounded in your net worth, liquidity and concentration",
          "Plan order enforced: emergency fund, then tax-wrapper capacity, then diversified core, then a capped satellite sleeve",
          "Position sizing and concentration limits attached to every recommendation",
          "The bear case and the falsifying evidence stated alongside any bull case",
          "Currency risk called out explicitly, including EGP and JOD exposure",
        ]}
        requires="This is an information and modelling tool, not regulated financial advice. Confirm any decision with an FCA-authorised adviser."
      />
    </AppShell>
  );
}
