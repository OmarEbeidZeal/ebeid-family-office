import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { ScopeProvider } from "@/hooks/useScope";
import { ThemeProvider } from "@/hooks/useTheme";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/themes";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="wordmark text-[0.7rem]">Ebeid Family Office</p>
        <h1 className="mt-6 text-2xl font-light tracking-tight text-foreground">
          That page isn't here
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The address you followed doesn't match anything in the system.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="wordmark text-[0.7rem]">Ebeid Family Office</p>
        <h1 className="mt-6 text-2xl font-light tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Something went wrong while loading your data. No figures were changed.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0A0B0D" },
      { title: "Ebeid Family Office" },
      {
        name: "description",
        content: "Private multi-currency wealth management for the Ebeid household.",
      },
      { property: "og:title", content: "Ebeid Family Office" },
      {
        property: "og:description",
        content: "Private multi-currency wealth management for the Ebeid household.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Outfit:wght@200;300;400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="dark"
      data-theme={DEFAULT_THEME}
      data-mode="dark"
      data-signs="green-red"
    >
      <head>
        {/* Applies the chosen theme before first paint, so nobody who picked a
            light theme sees a black flash on the way in. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Appearance is recorded on the profile, so the theme provider sits
          inside the one that knows who is signed in. */}
      <AuthProvider>
        <ThemeProvider>
          <CurrencyProvider>
            <ScopeProvider>
              <TooltipProvider delayDuration={120}>
                {/* Required: nested routes render here. */}
                <Outlet />
                <Toaster position="top-right" />
              </TooltipProvider>
            </ScopeProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
