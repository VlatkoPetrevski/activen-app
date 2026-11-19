import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, createMemoryRouter, RouterProvider } from "react-router";
import type { Api } from "../api/api.js";
import { ApiProvider } from "../api/ApiContext.js";
import { AuthProvider } from "../auth/AuthContext.js";
import { I18nProvider } from "../i18n/I18nContext.js";
import { ConfirmProvider } from "../ui/Confirm.js";
import { routes } from "./routes.js";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    },
  });
}

/**
 * App root: API (real or demo), data cache, language, session, routes. The demo keeps routes in
 * memory: it runs embedded (e.g. in a hosted preview frame) where the URL cannot carry a path.
 */
export function App({ api, routing }: { api: Api; routing: "browser" | "memory" }) {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() =>
    routing === "memory"
      ? createMemoryRouter(routes, { initialEntries: ["/"] })
      : createBrowserRouter(routes),
  );
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <ConfirmProvider>
              <RouterProvider router={router} />
            </ConfirmProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
