import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AdvisorMessageRow } from "@/hooks/useFinancials";

/**
 * The advisor conversation.
 *
 * History is persisted server-side, so this hook only owns the message in
 * flight: the thinking as it streams, the answer as it streams, and whatever
 * went wrong if it did. Nothing is invented client-side.
 */
export type StreamingTurn = {
  question: string;
  reasoning: string;
  answer: string;
};

export function useAdvisorChat() {
  const { household } = useAuth();
  const queryClient = useQueryClient();
  const controllerRef = useRef<AbortController | null>(null);

  const [turn, setTurn] = useState<StreamingTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  const history = useQuery({
    queryKey: ["advisor-chat", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("advisor_chat")
        .select("id, role, content, reasoning, model, created_at")
        .eq("household_id", household!.id)
        .order("created_at", { ascending: true })
        .limit(300);
      if (queryError) throw queryError;
      return (data ?? []) as AdvisorMessageRow[];
    },
  });

  const refreshHistory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["advisor-chat", household?.id] });
  }, [queryClient, household?.id]);

  const send = useCallback(
    async (message: string) => {
      const question = message.trim();
      if (!question || thinking) return;

      setError(null);
      setTurn({ question, reasoning: "", answer: "" });
      setThinking(true);

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Your session expired. Sign in again to continue.");

        const response = await fetch("/api/advisor/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: question }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "The advisor could not be reached.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");
          while (newline !== -1) {
            const raw = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!raw) continue;

            let event: {
              type: string;
              delta?: string;
              message?: string;
            };
            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            if (event.type === "reasoning") {
              setTurn((current) =>
                current
                  ? { ...current, reasoning: current.reasoning + (event.delta ?? "") }
                  : current,
              );
            } else if (event.type === "text") {
              setTurn((current) =>
                current ? { ...current, answer: current.answer + (event.delta ?? "") } : current,
              );
            } else if (event.type === "error") {
              setError(event.message ?? "The advisor could not answer.");
            }
          }
        }

        await refreshHistory();
        setTurn(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          // Stopped by the user: the server keeps whatever was written.
          await refreshHistory();
          setTurn(null);
        } else {
          setError(caught instanceof Error ? caught.message : "The advisor could not answer.");
          await refreshHistory();
          setTurn((current) => (current ? { ...current, question: current.question } : current));
        }
      } finally {
        controllerRef.current = null;
        setThinking(false);
      }
    },
    [thinking, refreshHistory],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return {
    messages: history.data ?? [],
    loading: history.isLoading,
    turn,
    thinking,
    error,
    send,
    stop,
    dismissError,
  };
}
