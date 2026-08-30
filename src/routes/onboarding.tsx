import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { StepNames } from "@/components/onboarding/StepNames";
import { StepAccounts } from "@/components/onboarding/StepAccounts";
import { StepAssets } from "@/components/onboarding/StepAssets";
import { StepLiabilities } from "@/components/onboarding/StepLiabilities";
import { StepIncome } from "@/components/onboarding/StepIncome";
import { StepGoals } from "@/components/onboarding/StepGoals";
import { Wordmark } from "@/components/Wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ONBOARDING_STEPS, clearOnboardingDeferral, deferOnboarding } from "@/lib/onboarding";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Household Setup — Ebeid Family Office" },
      {
        name: "description",
        content:
          "A calm, one-step-at-a-time setup that records accounts, property, private shareholdings, debts, income and goals for the household.",
      },
      { property: "og:title", content: "Household Setup — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Record accounts, assets, debts, income and goals, one screen at a time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { session, loading, household, profile, profileLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  // Resume where the household left off, on any device.
  useEffect(() => {
    if (hydrated || !household) return;
    const saved = household.onboarding_step ?? 0;
    setStep(Math.min(Math.max(saved, 0), ONBOARDING_STEPS.length - 1));
    setHydrated(true);
  }, [household, hydrated]);

  const persistStep = useMutation({
    mutationFn: async (next: number) => {
      if (!household) return;
      if ((household.onboarding_step ?? 0) >= next) return;
      const { error } = await supabase
        .from("households")
        .update({ onboarding_step: next })
        .eq("id", household.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session-context"] }),
  });

  const complete = useMutation({
    mutationFn: async () => {
      if (!household) return;
      const { error } = await supabase
        .from("households")
        .update({
          onboarding_step: ONBOARDING_STEPS.length,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", household.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      clearOnboardingDeferral();
      await queryClient.invalidateQueries({ queryKey: ["session-context"] });
      toast.success("Setup complete");
      void navigate({ to: "/", replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const goTo = (index: number) => {
    const next = Math.min(Math.max(index, 0), ONBOARDING_STEPS.length - 1);
    setStep(next);
    persistStep.mutate(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const defer = () => {
    deferOnboarding();
    persistStep.mutate(step);
    void navigate({ to: "/", replace: true });
  };

  if (loading || (session && profileLoading) || !profile || !household) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-xs space-y-4 px-6 text-center">
          <Wordmark className="animate-pulse" />
          <Skeleton className="mx-auto h-2 w-32" />
        </div>
      </div>
    );
  }

  const furthest = Math.max(step, household.onboarding_step ?? 0);
  const key = ONBOARDING_STEPS[step]?.key ?? "names";

  return (
    <OnboardingLayout
      stepIndex={step}
      furthestStep={Math.min(furthest, ONBOARDING_STEPS.length - 1)}
      onJump={goTo}
      onDefer={defer}
    >
      {key === "names" && <StepNames onNext={() => goTo(1)} />}
      {key === "accounts" && <StepAccounts onBack={() => goTo(0)} onNext={() => goTo(2)} />}
      {key === "assets" && <StepAssets onBack={() => goTo(1)} onNext={() => goTo(3)} />}
      {key === "liabilities" && <StepLiabilities onBack={() => goTo(2)} onNext={() => goTo(4)} />}
      {key === "income" && <StepIncome onBack={() => goTo(3)} onNext={() => goTo(5)} />}
      {key === "goals" && <StepGoals onBack={() => goTo(4)} onFinish={() => complete.mutate()} />}
    </OnboardingLayout>
  );
}
