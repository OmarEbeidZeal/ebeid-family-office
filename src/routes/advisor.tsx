import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useCurrency } from "@/hooks/useCurrency";
import { useHouseholdContext } from "@/hooks/useHouseholdContext";
import { useAdvisorChat } from "@/hooks/useAdvisorChat";
import { useAdvisorNotes } from "@/hooks/useFinancials";
import { ContextStrip } from "@/components/advisor/ContextStrip";
import { BriefingPanel } from "@/components/advisor/BriefingPanel";
import { AdvisorComposer } from "@/components/advisor/AdvisorComposer";
import { AssistantMessage, UserMessage } from "@/components/advisor/ChatMessage";
import { SuggestedPrompts, buildSuggestions } from "@/components/advisor/SuggestedPrompts";

export const Route = createFileRoute("/advisor")({
  head: () => ({
    meta: [
      { title: "Advisor — Ebeid Family Office" },
      {
        name: "description",
        content:
          "A wealth manager's discipline applied to the household's actual balance sheet: liquidity first, sized positions, stated bear cases.",
      },
      { property: "og:title", content: "Advisor — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Grounded portfolio briefings and planning conversation for the Ebeid household.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdvisorPage,
});

function AdvisorPage() {
  const { base } = useCurrency();
  const { context, loading } = useHouseholdContext();
  const notes = useAdvisorNotes();
  const chat = useAdvisorChat();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => buildSuggestions(context, base), [context, base]);
  const hasPosition = context.investable.total !== null && (context.net_worth.assets ?? 0) > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat.messages.length, chat.turn?.answer, chat.turn?.reasoning]);

  const send = (message: string) => {
    void chat.send(message);
  };

  return (
    <AppShell
      title="Advisor"
      description="A wealth manager's discipline applied to your actual numbers — liquidity first, positions sized, the bear case stated."
    >
      <div className="space-y-6">
        <ContextStrip context={context} base={base} loading={loading} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="flex min-h-[32rem] flex-col rounded-lg border border-border bg-surface">
            <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
              {chat.loading ? (
                <div className="space-y-3">
                  <div className="skeleton h-4 w-1/2 rounded" />
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-4 w-2/3 rounded" />
                </div>
              ) : chat.messages.length === 0 && !chat.turn ? (
                <div className="space-y-5">
                  <div>
                    <p className="eyebrow text-gold">The conversation</p>
                    <p className="mt-2 max-w-prose text-sm leading-relaxed text-foreground/85">
                      Ask anything about the household's position. Every answer is reasoned from
                      your stored balances, holdings, goals and spending — and from the written
                      investment policy: a twelve-month reserve before risk, a capped satellite
                      sleeve, sized positions, and the bear case stated alongside the bull case.
                    </p>
                    <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                      {hasPosition
                        ? "It will decline anything it cannot ground in a number you have recorded."
                        : "Add accounts, assets and holdings first — with nothing recorded, the advisor has nothing to reason from and will say so."}
                    </p>
                  </div>
                  <SuggestedPrompts
                    suggestions={suggestions}
                    onPick={send}
                    disabled={chat.thinking}
                  />
                </div>
              ) : (
                <>
                  {chat.messages.map((message) =>
                    message.role === "user" ? (
                      <UserMessage key={message.id} content={message.content} />
                    ) : (
                      <AssistantMessage
                        key={message.id}
                        content={message.content}
                        reasoning={message.reasoning}
                      />
                    ),
                  )}
                  {chat.turn ? (
                    <>
                      <UserMessage content={chat.turn.question} />
                      <AssistantMessage
                        content={chat.turn.answer}
                        reasoning={chat.turn.reasoning}
                        live
                      />
                    </>
                  ) : null}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="space-y-3 border-t border-border px-4 py-4 sm:px-6">
              {chat.error ? (
                <div className="flex items-start gap-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 leading-relaxed">{chat.error}</span>
                  <button type="button" onClick={chat.dismissError} aria-label="Dismiss error">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {chat.messages.length > 0 && !chat.thinking && suggestions.length > 0 ? (
                <SuggestedPrompts
                  suggestions={suggestions.slice(0, 3)}
                  onPick={send}
                  disabled={chat.thinking}
                />
              ) : null}

              <AdvisorComposer
                draft={draft}
                onDraftChange={setDraft}
                onSend={send}
                onStop={chat.stop}
                busy={chat.thinking}
                placeholder="Ask about liquidity, concentration, a goal's timeline, or a position…"
              />

              <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
                This is an information and modelling tool, not regulated financial advice. Confirm
                any decision with an FCA-authorised adviser before acting on it.
              </p>
            </div>
          </section>

          <BriefingPanel
            notes={notes.data ?? []}
            loading={notes.isLoading}
            canRun={!loading && hasPosition}
          />
        </div>
      </div>
    </AppShell>
  );
}
