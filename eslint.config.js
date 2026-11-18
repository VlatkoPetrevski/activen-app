import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "warn",
    },
  },
  {
    // Node build scripts.
    files: ["**/scripts/**/*.mjs"],
    languageOptions: { globals: { URL: "readonly", console: "readonly" } },
    rules: { "no-console": "off" },
  },
  {
    // Tests assert on known fixtures; `!` keeps them readable. Production code stays strict.
    files: ["**/test/**/*.ts", "**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
