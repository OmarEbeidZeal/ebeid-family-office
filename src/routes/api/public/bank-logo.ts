/**
 * Bank marks, proxied.
 *
 * Logo.dev needs a publishable token, and an image tag cannot carry one without
 * putting it in the page. So the token stays on the server and this route
 * fetches the mark — but only for domains that appear in the app's own bank
 * list, so it can never be used as a general-purpose image proxy.
 *
 * With no token configured the route answers 404 and the interface falls back
 * to a monogram. A missing logo is a cosmetic gap, never a broken page.
 */
import { createFileRoute } from "@tanstack/react-router";
import { BANKS } from "@/lib/ai/banks";

const ALLOWED = new Set(BANKS.map((bank) => bank.domain));

function notFound(reason: string) {
  return new Response(JSON.stringify({ error: reason }), {
    status: 404,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}

async function handleGet({ request }: { request: Request }) {
  const url = new URL(request.url);
  const token = process.env["LOGODEV_TOKEN"] ?? process.env["LOGO_DEV_TOKEN"];

  // The interface asks once whether marks are available at all, so it can draw
  // monograms straight away instead of firing an image request per bank.
  if (url.searchParams.get("probe") === "1") {
    return new Response(JSON.stringify({ available: Boolean(token) }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  }

  const domain = (url.searchParams.get("domain") ?? "").toLowerCase().trim();
  const size = Math.min(Math.max(Number(url.searchParams.get("size") ?? 64), 16), 256);

  if (!domain || !ALLOWED.has(domain)) return notFound("Unknown bank");
  if (!token) return notFound("No logo token configured");

  try {
    const upstream = await fetch(
      `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(token)}&size=${size}&format=png&retina=true`,
      { headers: { accept: "image/*" } },
    );
    if (!upstream.ok || !upstream.body) return notFound("Logo unavailable");

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        // A bank's mark does not change often; cache it hard.
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return notFound("Logo unavailable");
  }
}

export const Route = createFileRoute("/api/public/bank-logo")({
  server: { handlers: { GET: handleGet } },
});
