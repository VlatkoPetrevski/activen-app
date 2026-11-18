/** Errors the repositories raise; the API maps them to HTTP 404 / 409 / 422. */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * An existing account already uses this email. Accounts are never merged silently: the person signs
 * in with one of `providers` and links the new identity from the profile.
 */
export class AccountExistsError extends ConflictError {
  constructor(public readonly providers: string[]) {
    super("An account with this email already exists");
    this.name = "AccountExistsError";
  }
}

export type AuthFailure = "invalid" | "expired" | "revoked" | "reused";

/** A credential (refresh token, magic link) that cannot be used; the API answers 401. */
export class AuthError extends Error {
  constructor(public readonly reason: AuthFailure) {
    super(`Authentication failed: ${reason}`);
    this.name = "AuthError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** PostgreSQL unique-violation, possibly wrapped by the driver/ORM in `cause`. */
export function isUniqueViolation(e: unknown): boolean {
  let err: unknown = e;
  for (let i = 0; i < 3 && err; i++) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505")
      return true;
    err = (err as { cause?: unknown }).cause;
  }
  return false;
}
