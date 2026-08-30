import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Ebeid Family Office" },
      {
        name: "description",
        content: "Private access to the Ebeid household wealth management system.",
      },
      { property: "og:title", content: "Sign in · Ebeid Family Office" },
      {
        property: "og:description",
        content: "Private access to the Ebeid household wealth management system.",
      },
    ],
  }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "At least 8 characters"),
});

const signUpSchema = signInSchema.extend({
  fullName: z.string().min(2, "Enter your full name"),
});

type Mode = "signin" | "signup";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [submitting, setSubmitting] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  const form = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(mode === "signup" ? signUpSchema : (signInSchema as never)),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { registerAllowedUser } = await import("@/lib/auth.functions");
        await registerAllowedUser({
          data: {
            email: values.email.trim().toLowerCase(),
            password: values.password,
            fullName: values.fullName,
          },
        });
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (error) throw error;
      toast.success(mode === "signup" ? "Account created" : "Welcome back");
      navigate({ to: "/" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      toast.error(message);
      form.setError("email", { message });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-gold text-2xl leading-none">◆</p>
          <h1 className="mt-4 text-lg font-light tracking-[0.24em] uppercase">
            Ebeid Family Office
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Private wealth management · invitation only
          </p>
        </div>

        <form onSubmit={onSubmit} className="hairline space-y-4 rounded-lg bg-surface p-6">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" autoComplete="name" {...form.register("fullName")} />
              {form.formState.errors.fullName && (
                <p className="text-xs text-loss">{form.formState.errors.fullName.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-loss">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-loss">{form.formState.errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>

          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              form.clearErrors();
            }}
          >
            {mode === "signin"
              ? "Have an invitation? Create your account"
              : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
