import type { Role } from "@activen/db";
import type { Request } from "express";

/** The authenticated caller, attached to the request by the auth guard. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  roles: Role[];
}

export interface AppRequest extends Request {
  auth?: AuthContext;
}
