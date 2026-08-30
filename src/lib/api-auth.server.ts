/**
 * Bearer authentication for server routes.
 *
 * Server functions get this from the generated middleware; a streaming route
 * has to do it itself. Same contract: a verified Supabase session, a client
 * scoped to that user so RLS still applies, and nothing else gets through.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export type AuthedRequest = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export class UnauthorizedError extends Error {}

export async function authenticateRequest(request: Request): Promise<AuthedRequest> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The backend is not configured for this deployment.");

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError("Not signed in.");
  const token = header.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) throw new UnauthorizedError("Not signed in.");

  const supabase = createClient<Database>(url, key, {
    global: {
      fetch: createSupabaseFetch(key),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new UnauthorizedError("Session expired — sign in again.");

  return { supabase, userId: data.claims.sub };
}
