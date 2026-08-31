/**
 * One error type for everything the Lovable AI gateway can say no to, so
 * callers branch on meaning rather than on a status code.
 *
 * `retryable` means the same request may work in a moment (rate limits, an
 * upstream wobble). Anything else is terminal: re-sending it produces the same
 * answer, so the work stops and the household is told why.
 */
export class AiGatewayError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(input: { message: string; status: number; retryable?: boolean }) {
    super(input.message);
    this.name = "AiGatewayError";
    this.status = input.status;
    this.retryable = input.retryable ?? false;
  }
}

/** Plain English per status, written for the person reading the screen. */
export function describeGatewayFailure(input: { status: number; body?: string }): AiGatewayError {
  const { status } = input;
  const snippet = (input.body ?? "").replace(/\s+/g, " ").slice(0, 220);

  if (status === 401) {
    return new AiGatewayError({
      status,
      message:
        "The Lovable AI key was refused. Nothing was charged — the key needs re-provisioning before AI work can run.",
    });
  }
  if (status === 402) {
    return new AiGatewayError({
      status,
      message:
        "Lovable AI credits have run out. Add credits in Lovable under Plans & credits, and this will run again.",
    });
  }
  if (status === 403) {
    return new AiGatewayError({
      status,
      message:
        "Lovable AI is blocked for this workspace — an admin setting or a credit limit is in the way.",
    });
  }
  if (status === 429) {
    return new AiGatewayError({
      status,
      retryable: true,
      message: "Lovable AI is rate limited right now. Nothing was lost — this retries on its own.",
    });
  }
  if (status >= 500) {
    return new AiGatewayError({
      status,
      retryable: true,
      message: `Lovable AI had a temporary problem (${status}). This retries on its own.`,
    });
  }
  return new AiGatewayError({
    status,
    message: `Lovable AI rejected the request (${status}).${snippet ? ` ${snippet}` : ""}`,
  });
}
