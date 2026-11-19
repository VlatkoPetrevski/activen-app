/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * `vite` / `vite build`: the real app against the API (dev server proxies /v1 to localhost:3000).
 * `vite build --mode demo`: a self-contained demo with sample data (no server), in-memory routing
 * and relative asset paths so it can be hosted on any path or embedded.
 */
export default defineConfig(({ mode }) => ({
  base: mode === "demo" ? "./" : "/",
  plugins: [
    react(),
    VitePWA({
      disable: mode === "demo",
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "ActiveN",
        short_name: "ActiveN",
        description: "Training plan, analysis and coach workplace",
        theme_color: "#B5482B",
        background_color: "#FBF7F2",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        // App shell only; API responses are never cached by the service worker (personal data).
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/v1\//, /^\/\.well-known\//, /^\/docs/],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:3000",
      "/.well-known": "http://localhost:3000",
    },
  },
  build: { sourcemap: mode !== "demo", target: "es2022" },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/vite-env.d.ts"],
      thresholds: { lines: 70, functions: 60, branches: 60, statements: 70 },
    },
  },
}));
