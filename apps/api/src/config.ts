import { z } from "zod";

/** Comma-separated list → trimmed, non-empty entries. */
const list = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

/** Environment configuration, validated at startup: the process refuses to start when invalid. */
const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((u) => u.startsWith("postgres"), "must be a postgres:// URL"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    /** Comma-separated list of allowed browser origins (the web app). */
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((s) => list.parse(s)),
    /** Number of reverse-proxy hops to trust for the client IP (rate limiting). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
    /** File uploads per minute per client IP (parsing activity files is CPU work). */
    IMPORT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(30),
    /** Per client IP on the sign-in endpoints. */
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),

    /** Web app origin used in magic links (e.g. https://activen.app). */
    PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
    /**
     * Ed25519 private key as a JWK (JSON) for signing access tokens. Required in production; in
     * development and tests a key is generated at startup (tokens then end with the process).
     */
    AUTH_SIGNING_KEY: z.string().optional(),
    AUTH_ISSUER: z.string().default("https://api.activen.app"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    /** Refresh-token cookie for the web app; `Secure` everywhere except local development/tests. */
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    /** OAuth client IDs whose Google ID tokens are accepted (web, iOS, Android). Empty = disabled. */
    GOOGLE_CLIENT_IDS: list,
    /** Apple Services ID (web) and bundle ID (iOS) accepted as audience. Empty = disabled. */
    APPLE_CLIENT_IDS: list,
    /** `log` writes emails to the log (links only outside production). */
    EMAIL_TRANSPORT: z.enum(["log"]).default("log"),
    /** AI for "Структурирај" (optional): both set = on; the parser works without it. */
    ACTIVEN_AI_API_KEY: z.string().min(1).optional(),
    ACTIVEN_AI_MODEL: z.string().min(1).optional(),
    /** Directory for original uploaded activity files (kept for re-reading, deleted with the account). */
    ACTIVEN_FILE_STORE_DIR: z.string().min(1).default(".data/files"),
  })
  .superRefine((c, ctx) => {
    if (c.NODE_ENV === "production" && !c.AUTH_SIGNING_KEY)
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SIGNING_KEY"],
        message: "is required in production",
      });
  })
  .transform((c) => ({ ...c, COOKIE_SECURE: c.COOKIE_SECURE ?? c.NODE_ENV === "production" }));

export type AppConfig = z.output<typeof ConfigSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n- ${issues.join("\n- ")}`);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success)
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  return parsed.data;
}
