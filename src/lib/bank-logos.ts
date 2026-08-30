/**
 * Whether bank marks can be fetched at all.
 *
 * Logo.dev needs a token that lives on the server, so the browser asks once per
 * session rather than discovering it one broken image at a time. With no token
 * every mark is a monogram, which is a deliberate look, not a failure.
 */
let probe: Promise<boolean> | null = null;

export function bankLogosAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  probe ??= fetch("/api/public/bank-logo?probe=1")
    .then((response) => (response.ok ? response.json() : { available: false }))
    .then((body: { available?: boolean }) => Boolean(body?.available))
    .catch(() => false);
  return probe;
}
