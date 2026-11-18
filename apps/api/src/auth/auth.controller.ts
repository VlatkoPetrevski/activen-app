import { AuthError } from "@activen/db";
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { APP_CONFIG, TOKEN_SERVICE } from "../tokens.js";
import { ApiZodBody, ValidBody } from "../validation.js";
import { AuthService, type RefreshResult, type SignInResult } from "./auth.service.js";
import type { AppRequest } from "./auth.types.js";
import { Public } from "./decorators.js";
import type { TokenService } from "./token.service.js";

export const REFRESH_COOKIE = "activen_rt";
const REFRESH_COOKIE_PATH = "/v1/auth";
/** Cookie-based refresh needs this header: a cross-site form cannot set it (CSRF defence). */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "activen";

/**
 * `web`: the refresh token lives only in an HttpOnly cookie (not readable by scripts).
 * `native`: the app stores it in the OS keychain, so it is returned in the body.
 */
const client = z.enum(["web", "native"]).default("web");

export const IdTokenSignIn = z.object({
  idToken: z.string().min(20).max(8192),
  /** Random value the client generated for this sign-in and passed to Google/Apple. */
  nonce: z.string().min(16).max(256),
  /** Apple gives the name to the client only on the first sign-in. */
  displayName: z.string().max(100).optional(),
  client,
});
export const EmailStart = z.object({
  email: z.string().min(3).max(254),
  locale: z.string().max(35).optional(),
});
export const EmailVerify = z.object({ token: z.string().min(20).max(128), client });
const RefreshBody = z.object({ refreshToken: z.string().min(20).max(128).optional(), client });
const LogoutBody = z.object({ refreshToken: z.string().min(20).max(128).optional() });

const userAgent = (req: AppRequest) => req.headers["user-agent"] ?? null;

@ApiTags("auth")
@Public()
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get("providers")
  @ApiOperation({ summary: "Sign-in methods enabled on this server" })
  providers() {
    return this.auth.providers();
  }

  @Post("google")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in with a Google ID token" })
  @ApiZodBody(IdTokenSignIn)
  async google(
    @ValidBody(IdTokenSignIn) body: z.output<typeof IdTokenSignIn>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(
      await this.auth.signInWithIdToken("google", body, userAgent(req)),
      body.client,
      res,
    );
  }

  @Post("apple")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in with an Apple identity token" })
  @ApiZodBody(IdTokenSignIn)
  async apple(
    @ValidBody(IdTokenSignIn) body: z.output<typeof IdTokenSignIn>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(
      await this.auth.signInWithIdToken("apple", body, userAgent(req)),
      body.client,
      res,
    );
  }

  @Post("email/start")
  @HttpCode(202)
  @ApiOperation({
    summary: "Email a one-time sign-in link (same answer whether or not the account exists)",
  })
  @ApiZodBody(EmailStart)
  async emailStart(
    @ValidBody(EmailStart) body: z.output<typeof EmailStart>,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    await this.auth.sendEmailLink(body.email, { locale: body.locale, acceptLanguage });
    return { status: "sent" };
  }

  @Post("email/verify")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in with the token from the emailed link" })
  @ApiZodBody(EmailVerify)
  async emailVerify(
    @ValidBody(EmailVerify) body: z.output<typeof EmailVerify>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(
      await this.auth.signInWithEmailToken(body.token, userAgent(req)),
      body.client,
      res,
    );
  }

  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "New access token; the refresh token rotates" })
  @ApiZodBody(RefreshBody)
  async refresh(
    @ValidBody(RefreshBody) body: z.output<typeof RefreshBody>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.refreshTokenFrom(body.refreshToken, req);
    try {
      return this.respond(await this.auth.refresh(token), body.client, res);
    } catch (e) {
      if (e instanceof AuthError) this.clearCookie(res);
      throw e;
    }
  }

  @Post("logout")
  @HttpCode(204)
  @ApiOperation({ summary: "Sign out this device" })
  @ApiZodBody(LogoutBody)
  async logout(
    @ValidBody(LogoutBody) body: z.output<typeof LogoutBody>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token =
      body.refreshToken ?? (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (token) {
      if (!body.refreshToken) this.requireCsrfHeader(req);
      await this.auth.signOut(token);
    }
    this.clearCookie(res);
  }

  private refreshTokenFrom(fromBody: string | undefined, req: AppRequest): string {
    if (fromBody) return fromBody;
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!cookie) throw new AuthError("invalid");
    this.requireCsrfHeader(req);
    return cookie;
  }

  private requireCsrfHeader(req: AppRequest): void {
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE)
      throw new ForbiddenException(`Missing ${CSRF_HEADER} header`);
  }

  private respond(
    result: SignInResult | RefreshResult,
    clientKind: "web" | "native",
    res: Response,
  ) {
    const { refreshToken, ...rest } = result;
    const body = { tokenType: "Bearer", ...rest };
    if (clientKind === "native") return { ...body, refreshToken };
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      expires: result.refreshExpiresAt,
    });
    return body;
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
    });
  }
}

/** Public signing keys of ActiveN access tokens (RFC 7517). */
@ApiTags("auth")
@Public()
@Controller({ path: ".well-known", version: VERSION_NEUTRAL })
export class WellKnownController {
  constructor(@Inject(TOKEN_SERVICE) private readonly tokens: TokenService) {}

  @Get("jwks.json")
  @ApiOperation({ summary: "JSON Web Key Set for verifying access tokens" })
  jwks() {
    return this.tokens.jwks();
  }
}
