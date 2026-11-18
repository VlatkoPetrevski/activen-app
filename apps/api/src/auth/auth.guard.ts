import { AuthError, type Repositories, type Role } from "@activen/db";
import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REPOSITORIES, TOKEN_SERVICE } from "../tokens.js";
import type { AppRequest } from "./auth.types.js";
import { IS_PUBLIC, REQUIRED_ROLES } from "./decorators.js";
import type { TokenService } from "./token.service.js";

/**
 * Global guard: every route requires a valid access token for an active session unless marked
 * `@Public()`. Roles are read from the database on each request, so changes apply immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(REPOSITORIES) private readonly repos: Repositories,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) throw new AuthError("invalid");
    const claims = await this.tokens.verify(token);
    if (!(await this.repos.sessions.isActive(claims.sessionId))) throw new AuthError("revoked");
    const roles = await this.repos.users.roles(claims.userId);
    req.auth = { ...claims, roles };

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, targets);
    if (required?.length && !required.some((r) => roles.includes(r)))
      throw new ForbiddenException(`Requires role: ${required.join(" or ")}`);
    return true;
  }
}
