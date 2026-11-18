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
      // `_`-prefixed names are deliberate discards (e.g. omitting keys via rest destructuring).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // NestJS modules are decorated classes that may only carry static factories.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
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
