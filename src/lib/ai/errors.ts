/**
 * One error type for every provider, so callers branch on meaning rather than
 * on whose API said no.
 *
 * `terminal` means re-sending the same request will fail the same way: a
 * missing key, exhausted credits, a blocked workspace, a rejected request. A
 * terminal failure never retries and never silently falls back into spending
 * somewhere else without saying so.
 */
export class AiProviderError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly terminal: boolean;

  constructor(input: {
    message: string;
    provider: string;
    status: number;
    retryable?: boolean;
    terminal?: boolean;
  }) {
    super(input.message);
    this.name = "AiProviderError";
    this.provider = input.provider;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
    this.terminal = input.terminal ?? !(input.retryable ?? false);
  }
}

/** Kept for callers that only care that AI could not be had. */
export class AiUnavailableError extends AiProviderError {
  constructor(message: string, provider = "lovable", status = 0) {
    super({ message, provider, status, retryable: false, terminal: true });
    this.name = "AiUnavailableError";
  }
}

/** Plain English per status, naming the provider that answered. */
export function describeAiFailure(input: {
  provider: string;
  label: string;
  status: number;
  body?: string;
}): AiProviderError {
  const { provider, label, status } = input;
  const snippet = (input.body ?? "").replace(/\s+/g, " ").slice(0, 220);

  if (status === 401 || status === 403) {
    return new AiProviderError({
      provider,
      status,
      retryable: false,
      terminal: true,
      message:
        status === 401
          ? `${label} refused the key. Check the key in Project Settings → Secrets, or switch the job back to Lovable AI.`
          : `${label} has blocked this request — an account setting or spending limit is in the way.`,
    });
  }
  if (status === 402) {
    return new AiProviderError({
      provider,
      status,
      retryable: false,
      terminal: true,
      message: `${label} has no credit left for this request. Top up the account, or switch the job to another provider.`,
    });
  }
  if (status === 429) {
    return new AiProviderError({
      provider,
      status,
      retryable: true,
      terminal: false,
      message: `${label} is rate limited right now. Nothing was lost — this retries on its own in a moment.`,
    });
  }
  if (status >= 500) {
    return new AiProviderError({
      provider,
      status,
      retryable: true,
      terminal: false,
      message: `${label} had a temporary problem (${status}). This retries on its own.`,
    });
  }
  return new AiProviderError({
    provider,
    status,
    retryable: false,
    terminal: true,
    message: `${label} rejected the request (${status}).${snippet ? ` ${snippet}` : ""}`,
  });
}
