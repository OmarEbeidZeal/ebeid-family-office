import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, Loader2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "./SettingsCard";
import {
  getAiSettings,
  listAiModels,
  saveAiSetting,
  testAiJob,
  type AiJobSetting,
  type AiTestResult,
} from "@/lib/ai.functions";
import {
  AI_JOBS,
  AI_PROVIDERS,
  LOVABLE_MODEL_CHOICES,
  MODEL_GUIDANCE,
  PROVIDER_LABELS,
  type AiJob,
  type AiProviderId,
} from "@/lib/ai/catalog";
import { cn } from "@/lib/utils";

/**
 * Which model does which job.
 *
 * Three jobs, three possible providers. Lovable AI needs no key of Omar's;
 * Anthropic and OpenAI light up the moment their secret exists. Model lists are
 * fetched from the provider itself rather than typed from memory, and the test
 * makes a real call so "configured" never means "assumed".
 */
export function AiModelsCard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAiSettings);

  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => load(),
  });

  const jobs = settings.data?.jobs ?? [];
  const available = settings.data?.available;

  return (
    <SettingsCard
      title="AI models"
      description="Reading statements, filing transactions and the advisor each run on a model you choose. Lovable AI is built in; adding an Anthropic or OpenAI key makes those providers selectable for any job."
    >
      <div className="space-y-4">
        {settings.isLoading ? (
          <p className="text-xs text-muted-foreground">Reading your settings…</p>
        ) : settings.error ? (
          <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2.5 text-xs text-loss">
            {(settings.error as Error).message}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {AI_PROVIDERS.map((provider) => {
                const ready = available?.[provider.id] ?? false;
                return (
                  <span
                    key={provider.id}
                    className={cn(
                      "hairline inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem]",
                      ready ? "text-foreground/85" : "text-muted-foreground",
                    )}
                    title={
                      ready
                        ? `${provider.label} is available.`
                        : `Add ${provider.secretName} in Project Settings → Secrets to use ${provider.label}.`
                    }
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        ready ? "bg-gain" : "bg-muted-foreground/50",
                      )}
                    />
                    {provider.label}
                    <span className="text-muted-foreground">{ready ? "ready" : "no key"}</span>
                  </span>
                );
              })}
            </div>

            <div className="space-y-3">
              {AI_JOBS.map((job) => {
                const setting = jobs.find((entry) => entry.job === job.id);
                if (!setting) return null;
                return (
                  <JobRow
                    key={job.id}
                    job={job.id}
                    label={job.label}
                    description={job.description}
                    setting={setting}
                    available={available ?? { lovable: true, anthropic: false, openai: false }}
                    onSaved={() => {
                      void queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
                    }}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  );
}

function JobRow({
  job,
  label,
  description,
  setting,
  available,
  onSaved,
}: {
  job: AiJob;
  label: string;
  description: string;
  setting: AiJobSetting;
  available: Record<AiProviderId, boolean>;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<AiProviderId>(setting.provider);
  const [model, setModel] = useState(setting.model);

  useEffect(() => {
    setProvider(setting.provider);
    setModel(setting.model);
  }, [setting.provider, setting.model]);

  const fetchModels = useServerFn(listAiModels);
  const save = useServerFn(saveAiSetting);
  const runTest = useServerFn(testAiJob);

  const remote = useQuery({
    queryKey: ["ai-models", provider],
    enabled: provider !== "lovable" && available[provider],
    staleTime: 10 * 60 * 1000,
    queryFn: () => fetchModels({ data: { provider } }),
  });

  const choices = useMemo(() => {
    if (provider === "lovable") return LOVABLE_MODEL_CHOICES[job];
    const models = remote.data?.models ?? [];
    return model && !models.includes(model) ? [model, ...models] : models;
  }, [provider, job, remote.data, model]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { job, provider, model: model || null } }),
    onSuccess: onSaved,
  });

  const testMutation = useMutation({
    mutationFn: (): Promise<AiTestResult> => runTest({ data: { job } }),
  });

  const dirty = provider !== setting.provider || model !== setting.model;
  const needsModel = provider !== "lovable" && !model;
  const test = testMutation.data;

  return (
    <div className="hairline space-y-3 rounded-md bg-surface-raised p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="mt-1 max-w-md text-[0.7rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="mr-1.5 h-3.5 w-3.5" />
          )}
          {testMutation.isPending ? "Testing…" : "Test"}
        </Button>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow text-muted-foreground">Provider</span>
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
            value={provider}
            onChange={(event) => {
              const next = event.target.value as AiProviderId;
              setProvider(next);
              setModel(next === "lovable" ? LOVABLE_MODEL_CHOICES[job][0]! : "");
            }}
          >
            {AI_PROVIDERS.map((entry) => (
              <option key={entry.id} value={entry.id} disabled={!available[entry.id]}>
                {entry.label}
                {available[entry.id] ? "" : " — no key"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eyebrow text-muted-foreground">Model</span>
          <select
            className="num mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={provider !== "lovable" && remote.isLoading}
          >
            <option value="">
              {provider === "lovable"
                ? "Choose a model"
                : remote.isLoading
                  ? "Reading the provider's list…"
                  : choices.length
                    ? "Choose a model"
                    : "No models available"}
            </option>
            {choices.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[0.68rem] leading-relaxed text-muted-foreground">{MODEL_GUIDANCE[job]}</p>

      {remote.data?.error ? (
        <p className="rounded-md border border-warn/40 bg-warn-soft px-2.5 py-2 text-[0.7rem] text-warn">
          {remote.data.error}
        </p>
      ) : null}

      {setting.note ? (
        <p className="rounded-md border border-warn/40 bg-warn-soft px-2.5 py-2 text-[0.7rem] leading-relaxed text-warn">
          {setting.note} Right now this job runs on{" "}
          <span className="num">{setting.effective.model}</span>.
        </p>
      ) : null}

      {test ? (
        <div
          className={cn(
            "rounded-md border px-2.5 py-2 text-[0.7rem] leading-relaxed",
            test.ok ? "border-gain/30 bg-gain/10 text-gain" : "border-loss/40 bg-loss/10 text-loss",
          )}
        >
          <p className="flex items-start gap-1.5">
            {test.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {test.ok
                ? `${PROVIDER_LABELS[test.provider]} answered on ${test.model} in ${(
                    test.durationMs / 1000
                  ).toFixed(1)}s.`
                : test.error}
            </span>
          </p>
          {test.notes.length > 0 ? (
            <p className="mt-1.5 pl-5 opacity-90">{test.notes.join(" ")}</p>
          ) : null}
        </div>
      ) : testMutation.error ? (
        <p className="rounded-md border border-loss/40 bg-loss/10 px-2.5 py-2 text-[0.7rem] text-loss">
          {(testMutation.error as Error).message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || needsModel || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        {needsModel ? (
          <span className="text-[0.68rem] text-muted-foreground">
            Pick a model from {PROVIDER_LABELS[provider]}'s own list before saving.
          </span>
        ) : dirty ? (
          <span className="text-[0.68rem] text-muted-foreground">Unsaved change.</span>
        ) : saveMutation.isSuccess ? (
          <span className="text-[0.68rem] text-muted-foreground">Saved.</span>
        ) : null}
        {saveMutation.error ? (
          <span className="text-[0.68rem] text-loss">{(saveMutation.error as Error).message}</span>
        ) : null}
      </div>
    </div>
  );
}
