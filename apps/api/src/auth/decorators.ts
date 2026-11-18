import type { Role } from "@activen/db";
import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import type { AppRequest, AuthContext } from "./auth.types.js";

export const IS_PUBLIC = "activen:public";
export const REQUIRED_ROLES = "activen:roles";

/** The route needs no access token. Everything else is authenticated by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The caller needs at least one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);

/** Injects the authenticated caller. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<AppRequest>().auth;
    if (!auth) throw new UnauthorizedException();
    return auth;
  },
);
