import type { Repositories } from "@activen/db";
import type { AthleteSettings } from "@activen/domain";
import {
  DeleteAccount,
  LinkEmailStart,
  LinkEmailVerify,
  LinkIdToken,
  ProfilePatch,
  SelfServiceRole as RoleParam,
  SettingsPatch,
  HrZonesPut,
} from "@activen/contracts/requests";
import { hrZonesView, manualZones, type HrZonesDto } from "@activen/contracts";
import { localDateOf } from "@activen/domain";
import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { z } from "zod";
import { AuthService } from "../auth/auth.service.js";
import type { AuthContext } from "../auth/auth.types.js";
import { CurrentAuth } from "../auth/decorators.js";
import { REFRESH_COOKIE } from "../auth/auth.controller.js";
import { ImportService } from "../imports/import.service.js";
import { REPOSITORIES } from "../tokens.js";
import { ApiZodBody, ValidBody, ZodPipe } from "../validation.js";

@ApiTags("me")
@ApiBearerAuth()
@Controller({ path: "me", version: "1" })
export class MeController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ImportService) private readonly imports: ImportService,
  ) {}

  @Get()
  @ApiOperation({ summary: "The signed-in user: profile, roles, sign-in methods and settings" })
  async me(@CurrentAuth() a: AuthContext) {
    const [user, identities, settings] = await Promise.all([
      this.repos.users.get(a.userId),
      this.repos.users.identities(a.userId),
      this.repos.settings.get(a.userId),
    ]);
    return { user, identities, settings };
  }

  @Patch()
  @ApiOperation({ summary: "Update the profile" })
  @ApiZodBody(ProfilePatch)
  updateProfile(
    @CurrentAuth() a: AuthContext,
    @ValidBody(ProfilePatch) body: z.output<typeof ProfilePatch>,
  ) {
    return this.repos.users.updateProfile(a.userId, body);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: "Delete the account and all of its data (irreversible)" })
  @ApiZodBody(DeleteAccount)
  async deleteAccount(
    @CurrentAuth() a: AuthContext,
    @ValidBody(DeleteAccount) _body: z.output<typeof DeleteAccount>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // Kept original files first: their keys are listed from the rows the deletion removes.
    await this.imports.deleteOriginals(a.userId);
    await this.repos.users.deleteAccount(a.userId);
    res.clearCookie(REFRESH_COOKIE, { path: "/v1/auth" });
  }

  @Put("roles/:role")
  @ApiOperation({ summary: "Take on a role (athlete or coach)" })
  async addRole(
    @CurrentAuth() a: AuthContext,
    @Param("role", new ZodPipe(RoleParam)) role: z.output<typeof RoleParam>,
  ) {
    return { roles: await this.repos.users.addRole(a.userId, role) };
  }

  @Delete("roles/:role")
  @ApiOperation({ summary: "Give up a role (at least one remains; coaches end their links first)" })
  async removeRole(
    @CurrentAuth() a: AuthContext,
    @Param("role", new ZodPipe(RoleParam)) role: z.output<typeof RoleParam>,
  ) {
    return { roles: await this.repos.users.removeRole(a.userId, role) };
  }

  @Get("settings")
  @ApiOperation({ summary: "Athlete settings (defaults until saved)" })
  settings(@CurrentAuth() a: AuthContext): Promise<AthleteSettings> {
    return this.repos.settings.get(a.userId);
  }

  @Patch("settings")
  @ApiOperation({
    summary: "Change athlete settings (language, units, time zone, sources, HR zones)",
  })
  @ApiZodBody(SettingsPatch)
  async updateSettings(
    @CurrentAuth() a: AuthContext,
    @ValidBody(SettingsPatch) patch: z.output<typeof SettingsPatch>,
  ): Promise<AthleteSettings> {
    const current = await this.repos.settings.get(a.userId);
    const next = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Partial<AthleteSettings>;
    return this.repos.settings.save(a.userId, { ...current, ...next });
  }

  @Get("hr-zones")
  @ApiOperation({ summary: "Heart-rate zones in use today and where they come from" })
  async hrZones(@CurrentAuth() a: AuthContext): Promise<HrZonesDto> {
    const settings = await this.repos.settings.get(a.userId);
    const today = localDateOf(new Date().toISOString(), settings.timeZone);
    return hrZonesView(await this.repos.hrZones.list(a.userId), today, settings);
  }

  @Put("hr-zones")
  @ApiOperation({
    summary: "Set own zones (lower bounds of zones 2–5); a new version from today, mode manual",
  })
  @ApiZodBody(HrZonesPut)
  async setHrZones(
    @CurrentAuth() a: AuthContext,
    @ValidBody(HrZonesPut) body: z.output<typeof HrZonesPut>,
  ): Promise<HrZonesDto> {
    const settings = await this.repos.settings.get(a.userId);
    const today = localDateOf(new Date().toISOString(), settings.timeZone);
    await this.repos.hrZones.addVersion({
      userId: a.userId,
      source: "manual",
      name: "ActiveN",
      effectiveFrom: today,
      zones: manualZones(body.lowerBounds),
    });
    const next = await this.repos.settings.save(a.userId, {
      ...settings,
      hrZones: { mode: "manual" },
    });
    return hrZonesView(await this.repos.hrZones.list(a.userId), today, next);
  }

  @Get("identities")
  @ApiOperation({ summary: "Sign-in methods linked to the account" })
  identities(@CurrentAuth() a: AuthContext) {
    return this.repos.users.identities(a.userId);
  }

  @Post("identities/google")
  @ApiOperation({ summary: "Link a Google account" })
  @ApiZodBody(LinkIdToken)
  linkGoogle(
    @CurrentAuth() a: AuthContext,
    @ValidBody(LinkIdToken) body: z.output<typeof LinkIdToken>,
  ) {
    return this.auth.linkIdToken(a.userId, "google", body.idToken, body.nonce);
  }

  @Post("identities/apple")
  @ApiOperation({ summary: "Link an Apple ID" })
  @ApiZodBody(LinkIdToken)
  linkApple(
    @CurrentAuth() a: AuthContext,
    @ValidBody(LinkIdToken) body: z.output<typeof LinkIdToken>,
  ) {
    return this.auth.linkIdToken(a.userId, "apple", body.idToken, body.nonce);
  }

  @Post("identities/email/start")
  @HttpCode(202)
  @ApiOperation({ summary: "Email a confirmation link to add this address as a sign-in method" })
  @ApiZodBody(LinkEmailStart)
  async linkEmailStart(
    @CurrentAuth() a: AuthContext,
    @ValidBody(LinkEmailStart) body: z.output<typeof LinkEmailStart>,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    await this.auth.sendEmailLink(
      body.email,
      { locale: body.locale, acceptLanguage },
      { purpose: "link", userId: a.userId },
    );
    return { status: "sent" };
  }

  @Post("identities/email/verify")
  @ApiOperation({ summary: "Confirm the emailed link and add the address" })
  @ApiZodBody(LinkEmailVerify)
  linkEmailVerify(
    @CurrentAuth() a: AuthContext,
    @ValidBody(LinkEmailVerify) body: z.output<typeof LinkEmailVerify>,
  ) {
    return this.auth.linkEmailToken(a.userId, body.token);
  }

  @Delete("identities/:id")
  @ApiOperation({ summary: "Remove a sign-in method (the last one stays)" })
  unlink(@CurrentAuth() a: AuthContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.repos.users.unlinkIdentity(a.userId, id);
  }

  @Get("sessions")
  @ApiOperation({ summary: "Signed-in devices" })
  async sessions(@CurrentAuth() a: AuthContext) {
    const list = await this.repos.sessions.listActive(a.userId);
    return list.map(({ userId: _u, ...s }) => ({ ...s, current: s.id === a.sessionId }));
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Sign out a device" })
  async revokeSession(
    @CurrentAuth() a: AuthContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.repos.sessions.revoke(a.userId, id);
  }

  @Post("sessions/revoke-others")
  @ApiOperation({ summary: "Sign out every other device" })
  async revokeOthers(@CurrentAuth() a: AuthContext) {
    return { revoked: await this.repos.sessions.revokeAll(a.userId, a.sessionId) };
  }
}
