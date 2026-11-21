import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/model.ts", "src/testing.ts"],
      // Parsers carry many defensive fallbacks for fields a file may lack; branches at 75 %.
      thresholds: { lines: 90, functions: 90, branches: 75, statements: 90 },
    },
  },
});
