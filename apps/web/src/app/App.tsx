import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, createHashRouter, RouterProvider } from "react-router";
import type { Api } from "../api/api.js";
import { ApiProvider } from "../api/ApiContext.js";
import { AuthProvider } from "../auth/AuthContext.js";
import { I18nProvider } from "../i18n/I18nContext.js";
import { routes } from "./routes.js";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    },
  });
}

/** App root: API (real or demo), data cache, language, session, routes. */
export function App({ api, hashRouting }: { api: Api; hashRouting: boolean }) {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() =>
    hashRouting ? createHashRouter(routes) : createBrowserRouter(routes),
  );
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
