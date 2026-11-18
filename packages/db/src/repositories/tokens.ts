import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe; only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
