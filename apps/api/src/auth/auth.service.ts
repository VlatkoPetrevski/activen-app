import { AuthError, type Repositories, type User } from "@activen/db";
import { createTranslator, negotiateLocale } from "@activen/i18n";
import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config.js";
import { APP_CONFIG, ID_TOKEN_VERIFIER, MAILER, REPOSITORIES, TOKEN_SERVICE } from "../tokens.js";
import type { IdProvider, IdTokenVerifier } from "./id-token.verifier.js";
import type { Mailer } from "./mailer.js";
import type { TokenService } from "./token.service.js";

export interface SignInResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: User;
  /** The account was created by this sign-in (the client shows onboarding). */
  created: boolean;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const LOGIN_LINK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(ID_TOKEN_VERIFIER) private readonly idTokens: IdTokenVerifier,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  providers(): Record<IdProvider | "email", boolean> {
    return {
      google: this.idTokens.enabled("google"),
      apple: this.idTokens.enabled("apple"),
      email: true,
    };
  }

  async signInWithIdToken(
    provider: IdProvider,
    input: { idToken: string; nonce: string; displayName?: string | undefined },
    userAgent: string | null,
  ): Promise<SignInResult> {
    const identity = await this.idTokens.verify(provider, input.idToken, input.nonce);
    const { user, created } = await this.repos.users.findOrCreateByIdentity({
      provider,
      subject: identity.subject,
      email: identity.email,
      // Apple sends the name only to the client, only on the first authorization.
      displayName: identity.name ?? input.displayName ?? "",
    });
    return this.startSession(user, created, userAgent);
  }

  async linkIdToken(userId: string, provider: IdProvider, idToken: string, nonce: string) {
    const identity = await this.idTokens.verify(provider, idToken, nonce);
    return this.repos.users.linkIdentity(userId, {
      provider,
      subject: identity.subject,
      email: identity.email,
    });
  }

  /**
   * Sends a one-time link. The answer never says whether the address has an account or was
   * rate-limited (no account enumeration, no inbox flooding).
   */
  async sendEmailLink(
    email: string,
    language: { locale?: string | undefined; acceptLanguage?: string | undefined },
    link: { purpose: "sign_in" } | { purpose: "link"; userId: string } = { purpose: "sign_in" },
  ): Promise<void> {
    const issued = await this.repos.loginTokens.issue(
      email,
      link.purpose,
      link.purpose === "link" ? link.userId : null,
    );
    if (!issued) return;
    const locale = negotiateLocale({
      userPreference: language.locale ?? null,
      acceptLanguage: language.acceptLanguage ?? null,
    });
    const { t } = createTranslator(locale);
    const path = link.purpose === "link" ? "auth/link-email" : "auth/email";
    const url = new URL(path, this.config.PUBLIC_WEB_URL.replace(/\/?$/, "/"));
    url.hash = `token=${issued.token}`; // fragment: never sent to servers or written to access logs
    const key = link.purpose === "link" ? "email.link" : "email.signIn";
    await this.mailer.send({
      to: issued.email,
      subject: t(`${key}.subject`),
      text: t(`${key}.body`, { url: url.toString(), minutes: LOGIN_LINK_MINUTES }),
    });
  }

  async signInWithEmailToken(token: string, userAgent: string | null): Promise<SignInResult> {
    const { email } = await this.repos.loginTokens.consume(token, "sign_in");
    const { user, created } = await this.repos.users.findOrCreateByIdentity({
      provider: "email",
      subject: email,
      email,
      displayName: "",
    });
    return this.startSession(user, created, userAgent);
  }

  async linkEmailToken(userId: string, token: string) {
    const consumed = await this.repos.loginTokens.consume(token, "link");
    // A link token is bound to the account that requested it.
    if (consumed.userId !== userId) throw new AuthError("invalid");
    return this.repos.users.linkIdentity(userId, {
      provider: "email",
      subject: consumed.email,
      email: consumed.email,
    });
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    const issued = await this.repos.sessions.rotate(refreshToken);
    return {
      accessToken: await this.tokens.issue({ userId: issued.userId, sessionId: issued.sessionId }),
      expiresIn: this.tokens.ttlSeconds,
      refreshToken: issued.refreshToken,
      refreshExpiresAt: issued.refreshExpiresAt,
    };
  }

  async signOut(refreshToken: string): Promise<void> {
    await this.repos.sessions.revokeByRefreshToken(refreshToken);
  }

  private async startSession(
    user: User,
    created: boolean,
    userAgent: string | null,
  ): Promise<SignInResult> {
    const session = await this.repos.sessions.create(user.id, userAgent);
    return {
      accessToken: await this.tokens.issue({ userId: user.id, sessionId: session.sessionId }),
      expiresIn: this.tokens.ttlSeconds,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      user,
      created,
    };
  }
}
