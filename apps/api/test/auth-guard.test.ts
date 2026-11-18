import type { Repositories } from "@activen/db";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { AuthGuard } from "../src/auth/auth.guard.js";
import type { AppRequest } from "../src/auth/auth.types.js";
import { IS_PUBLIC, REQUIRED_ROLES } from "../src/auth/decorators.js";
import { TokenService } from "../src/auth/token.service.js";

const tokenConfig = { AUTH_ISSUER: "test", ACCESS_TOKEN_TTL_SECONDS: 60 };

async function setup(roles: string[], meta: Record<string, unknown>) {
  const tokens = await TokenService.create(tokenConfig);
  const repos = {
    sessions: { isActive: async () => true },
    users: { roles: async () => roles },
  } as unknown as Repositories;
  const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
  const req = {
    headers: { authorization: `Bearer ${await tokens.issue({ userId: "u1", sessionId: "s1" })}` },
  } as AppRequest;
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { guard: new AuthGuard(reflector, tokens, repos), ctx, req };
}

describe("AuthGuard roles", () => {
  it("allows callers with one of the required roles and attaches the auth context", async () => {
    const { guard, ctx, req } = await setup(["athlete", "coach"], { [REQUIRED_ROLES]: ["coach"] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.auth).toEqual({ userId: "u1", sessionId: "s1", roles: ["athlete", "coach"] });
  });

  it("forbids callers without the role", async () => {
    const { guard, ctx } = await setup(["athlete"], { [REQUIRED_ROLES]: ["coach", "admin"] });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets public routes through without a token", async () => {
    const { guard, ctx, req } = await setup([], { [IS_PUBLIC]: true });
    req.headers.authorization = undefined;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
