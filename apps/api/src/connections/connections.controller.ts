import type { ConnectionDto } from "@activen/contracts";
import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Redirect,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthContext } from "../auth/auth.types.js";
import { CurrentAuth, Public } from "../auth/decorators.js";
import { PolarService, type PolarWebhookPayload, type SyncResult } from "./polar.service.js";
import { SyncWorker } from "./sync.worker.js";

/** The athlete's connected apps (Polar today; Garmin, Suunto, COROS follow the same shape). */
@ApiTags("connections")
@ApiBearerAuth()
@Controller({ path: "me/connections", version: "1" })
export class ConnectionsController {
  constructor(@Inject(PolarService) private readonly polar: PolarService) {}

  @Get()
  @ApiOperation({ summary: "Connected apps and whether each can be connected here" })
  list(@CurrentAuth() a: AuthContext): Promise<ConnectionDto[]> {
    return this.polar.connections(a.userId);
  }

  @Post("polar")
  @HttpCode(200)
  @ApiOperation({ summary: "Start connecting Polar Flow: returns the page to open" })
  connect(@CurrentAuth() a: AuthContext): { authorizeUrl: string } {
    return { authorizeUrl: this.polar.authorizeUrl(a.userId) };
  }

  @Post("polar/sync")
  @HttpCode(200)
  @ApiOperation({ summary: "Fetch the workouts Polar Flow offers now (last 30 days)" })
  sync(@CurrentAuth() a: AuthContext): Promise<SyncResult> {
    return this.polar.sync(a.userId);
  }

  @Delete("polar")
  @HttpCode(204)
  @ApiOperation({ summary: "Disconnect Polar and remove the workouts that came from it" })
  disconnect(@CurrentAuth() a: AuthContext): Promise<void> {
    return this.polar.disconnect(a.userId);
  }
}

/** Polar's side: the OAuth return and webhook deliveries (no ActiveN token; verified otherwise). */
@ApiTags("connections")
@Controller({ version: "1" })
export class PolarCallbackController {
  constructor(
    @Inject(PolarService) private readonly polar: PolarService,
    @Inject(SyncWorker) private readonly worker: SyncWorker,
  ) {}

  @Public()
  @Get("connections/polar/callback")
  @Redirect()
  @ApiExcludeEndpoint()
  async callback(@Query("code") code?: string, @Query("state") state?: string) {
    return { url: await this.polar.complete(code, state), statusCode: 302 };
  }

  @Public()
  @Post("webhooks/polar")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("polar-webhook-signature") signature?: string,
    @Headers("polar-webhook-event") event?: string,
  ): Promise<{ ok: true }> {
    const body = (req.body ?? {}) as PolarWebhookPayload;
    // Polar pings once when the webhook is created or changed, before a secret is known here.
    if (event === "PING" || body.event === "PING") return { ok: true };
    if (!req.rawBody || !this.polar.verifySignature(req.rawBody, signature))
      throw new UnauthorizedException("Invalid webhook signature");
    if (await this.polar.receive(body)) this.worker.kick();
    return { ok: true };
  }
}
