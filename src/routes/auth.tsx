import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Private, invitation-only access to the Ebeid household's wealth management system.",
      },
      { property: "og:title", content: "Sign in — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Private, invitation-only access to the household's wealth management system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";
type Values = { email: string; password: string; fullName: string };

const schemaFor = (mode: Mode) =>
  z.object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "At least 8 characters"),
    fullName: mode === "signup" ? z.string().min(2, "Enter your full name") : z.string(),
  });

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) void navigate({ to: "/", replace: true });
  }, [session, navigate]);

  const form = useForm<Values>({
    resolver: zodResolver(schemaFor(mode)),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { registerAllowedUser } = await import("@/lib/auth.functions");
        await registerAllowedUser({
          data: {
            email: values.email.trim().toLowerCase(),
            password: values.password,
            fullName: values.fullName ?? "",
          },
        });
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (error) throw error;
      toast.success(mode === "signup" ? "Account created" : "Welcome back");
      void navigate({ to: "/", replace: true });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong. Try again.";
      setNotice(message);
    } finally {
      setSubmitting(false);
    }
  });

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setNotice(null);
    form.clearErrors();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="justify-center" />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Private wealth management · by invitation only
          </p>
        </div>

        <div className="hairline overflow-hidden rounded-lg bg-surface">
          <div className="grid grid-cols-2 border-b border-border" role="tablist">
            {(
              [
                { value: "signin", label: "Sign in" },
                { value: "signup", label: "Sign up" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={mode === tab.value}
                onClick={() => switchMode(tab.value)}
                className={cn(
                  "px-4 py-3 text-xs uppercase tracking-[0.14em] transition-colors",
                  mode === tab.value
                    ? "bg-gold-soft text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4 p-6">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs text-muted-foreground">
                  Full name
                </Label>
                <Input id="fullName" autoComplete="name" {...form.register("fullName")} />
                {form.formState.errors.fullName && (
                  <p className="text-[0.7rem] text-loss">
                    {form.formState.errors.fullName.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-muted-foreground">
                Email
              </Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-[0.7rem] text-loss">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-[0.7rem] text-loss">{form.formState.errors.password.message}</p>
              )}
            </div>

            {notice && (
              <p
                role="alert"
                className="rounded-md border border-border bg-background/60 px-3 py-2.5 text-[0.75rem] leading-relaxed text-muted-foreground"
              >
                {notice}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
          {mode === "signin"
            ? "Accounts are created only for addresses the household has invited."
            : "Your address must already be on the household's invitation list."}
        </p>
      </div>
    </div>
  );
}
