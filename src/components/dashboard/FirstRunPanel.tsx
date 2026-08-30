import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Coins,
  Landmark,
  LineChart,
  Scale,
  Target,
  Wallet,
} from "lucide-react";

/**
 * The dashboard before any figures exist. It never draws an example curve or a
 * sample balance — it says plainly what is missing and where to put it.
 */
const ENTRY_POINTS = [
  {
    to: "/onboarding" as const,
    icon: Wallet,
    title: "Guided setup",
    body: "Six calm steps — names, accounts, assets, debts, income, first goals. Leave and resume whenever.",
    primary: true,
  },
  {
    to: "/accounts" as const,
    icon: Landmark,
    title: "Add an account",
    body: "Current, savings, ISA, SIPP, GIA or crypto, in any currency across the UK, Egypt, Jordan and the US.",
  },
  {
    to: "/balance-sheet" as const,
    icon: Building2,
    title: "Record what you own and owe",
    body: "Property, pensions and private shareholdings on one side; mortgages, loans and cards on the other.",
  },
  {
    to: "/goals" as const,
    icon: Target,
    title: "Set the goals",
    body: "What the money is actually for — priced, dated and funded from real balances rather than guesses.",
  },
];

const WHAT_APPEARS = [
  {
    icon: Scale,
    label: "Net worth and liquidity",
    body: "Assets less liabilities in sterling, split into what is spendable and what is locked up.",
  },
  {
    icon: Coins,
    label: "Currency exposure",
    body: "How much of the household sits in soft currencies — EGP and JOD are shown as the risk they are.",
  },
  {
    icon: LineChart,
    label: "Trend from today",
    body: "A snapshot is written the first day you open the app with figures in it; the curve builds from there.",
  },
];

export function FirstRunPanel() {
  return (
    <div className="space-y-4">
      <section className="hairline overflow-hidden rounded-lg bg-surface">
        <div className="border-b border-border px-6 py-8 sm:px-8 sm:py-10">
          <p className="eyebrow text-gold">First run</p>
          <h2 className="mt-3 max-w-xl text-2xl font-light leading-tight tracking-tight text-foreground sm:text-3xl">
            Nothing is on the balance sheet yet
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Every figure here comes from what you record — this screen stays empty rather than
            showing an example household. Add the first account and it becomes live immediately.
          </p>
        </div>

        <div className="grid sm:grid-cols-2">
          {ENTRY_POINTS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-start gap-3.5 border-b border-border px-6 py-5 transition-colors last:border-b-0 hover:bg-surface-raised sm:border-r sm:px-8 sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
            >
              <span
                className={
                  item.primary
                    ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-gold"
                    : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-muted-foreground transition-colors group-hover:text-foreground"
                }
              >
                <item.icon className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  {item.title}
                  <ArrowRight
                    className="h-3.5 w-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:text-gold group-hover:opacity-100"
                    strokeWidth={1.6}
                  />
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="hairline rounded-lg bg-surface px-6 py-5 sm:px-8">
        <p className="eyebrow text-foreground/70">What appears once the figures are in</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {WHAT_APPEARS.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" strokeWidth={1.6} />
              <div>
                <p className="text-sm text-foreground/85">{item.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
