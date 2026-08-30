import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Statement uploads, parsed transactions and category review for the Ebeid household.",
      },
      { property: "og:title", content: "Transactions — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Statement uploads, parsed transactions and category review.",
      },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  return (
    <AppShell
      title="Transactions"
      description="Bank statements in, categorised spending out — the layer that turns balances into behaviour."
    >
      <ComingSoon
        headline="Statement parsing arrives in the next build"
        body="Upload a PDF or CSV statement from any of your banks — UK, Egypt, Jordan or the US — and it is parsed into dated, categorised transactions against the right account, in the statement's own currency."
        bullets={[
          "Private, owner-scoped storage for every uploaded statement",
          "Automatic categorisation against your UK household categories, with a review queue",
          "Recurring payment and transfer detection so internal moves never count as spending",
          "Real spending totals feeding the dashboard's 'where the money goes' panel",
        ]}
        requires="Until then, the dashboard's spending panel stays empty rather than estimating. Committed outgoings you entered during onboarding still drive cashflow and runway."
      />
    </AppShell>
  );
}
