import { createHmac, timingSafeEqual } from "node:crypto";
import type { ConnectionDto } from "@activen/contracts";
import type { Repositories, VendorConnection } from "@activen/db";
import { ImportError, parseActivityFile } from "@activen/importers";
import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AppConfig } from "../config.js";
import { ImportService } from "../imports/import.service.js";
import { APP_CONFIG, POLAR_CLIENT, REPOSITORIES, TOKEN_CIPHER } from "../tokens.js";
import { PolarError, type PolarClient } from "./polar.client.js";
import type { TokenCipher } from "./token-cipher.js";

export interface PolarWebhookPayload {
  event?: string;
  user_id?: number | string;
  entity_id?: string;
  timestamp?: string;
}

export interface SyncResult {
  /** Exercises fetched and stored (new or updated). */
  stored: number;
  /** Exercises that could not be read (e.g. no samples). */
  skipped: number;
}

/**
 * Polar Flow as a source: the athlete connects once (OAuth), then every workout synced to Polar
 * Flow arrives by webhook and is read from its FIT file with the same importers as uploads.
 * Polar is a connected app, so its workouts rank above uploaded files by default; the same
 * workout from both is shown once (merged on read).
 */
@Injectable()
export class PolarService {
  private readonly log = new Logger(PolarService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(POLAR_CLIENT) private readonly polar: PolarClient | null,
    @Inject(TOKEN_CIPHER) private readonly cipher: TokenCipher | null,
    @Inject(ImportService) private readonly imports: ImportService,
  ) {}

  get enabled(): boolean {
    return this.polar !== null && this.cipher !== null;
  }

  private ready(): { polar: PolarClient; cipher: TokenCipher } {
    if (!this.polar || !this.cipher)
      throw new ServiceUnavailableException("Polar is not configured");
    return { polar: this.polar, cipher: this.cipher };
  }

  /** Where the athlete's browser comes back after approving in Polar Flow. */
  get redirectUri(): string {
    return `${this.config.PUBLIC_API_URL}/v1/connections/polar/callback`;
  }

  /** The Polar Flow page that asks the athlete to allow ActiveN. */
  authorizeUrl(userId: string): string {
    const { polar, cipher } = this.ready();
    return polar.authorizeUrl(cipher.signState(userId), this.redirectUri);
  }

  /**
   * Completes the connection; returns the web page to send the browser to. The state proves which
   * signed-in user started it, so a link cannot attach someone else's Polar account.
   */
  async complete(code: string | undefined, state: string | undefined): Promise<string> {
    const back = (result: string) => `${this.config.PUBLIC_WEB_URL}/profile?polar=${result}`;
    if (!code || !state) return back("denied");
    const { polar, cipher } = this.ready();
    const userId = cipher.verifyState(state);
    if (!userId) return back("expired");
    try {
      const token = await polar.exchangeCode(code, this.redirectUri);
      const other = await this.repos.connections.byExternalUser("polar", token.polarUserId);
      if (other && other.userId !== userId) return back("taken");
      await polar.registerUser(token.accessToken, userId);
      const connection = await this.repos.connections.upsert({
        userId,
        vendor: "polar",
        externalUserId: token.polarUserId,
        accessTokenEnc: cipher.encrypt(token.accessToken),
        tokenExpiresAt: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null,
        scopes: ["accesslink.read_all"],
      });
      // The last 30 days that Polar still offers; later workouts come by webhook.
      await this.syncConnection(connection);
      return back("connected");
    } catch (err) {
      this.log.warn(`Polar connection failed: ${err instanceof Error ? err.message : String(err)}`);
      return back(err instanceof PolarError && err.status === 403 ? "consents" : "error");
    }
  }

  async connections(userId: string): Promise<ConnectionDto[]> {
    const polar = await this.repos.connections.get(userId, "polar");
    return [
      {
        vendor: "polar",
        available: this.enabled,
        connected: polar !== null,
        status: polar?.status ?? null,
        connectedAt: polar?.connectedAt.toISOString() ?? null,
        lastSyncAt: polar?.lastSyncAt?.toISOString() ?? null,
        lastError: polar?.lastError ?? null,
      },
    ];
  }

  /** "Синхронизирај сега". */
  async sync(userId: string): Promise<SyncResult> {
    const connection = await this.repos.connections.get(userId, "polar");
    if (!connection) throw new NotFoundException("Polar is not connected");
    try {
      return await this.syncConnection(connection);
    } catch (err) {
      if (err instanceof PolarError) throw new BadGatewayException(`Polar: ${err.message}`);
      throw err;
    }
  }

  /** Disconnects at Polar and here, and removes the workouts that came from Polar. */
  async disconnect(userId: string): Promise<void> {
    const connection = await this.repos.connections.get(userId, "polar");
    if (!connection) throw new NotFoundException("Polar is not connected");
    if (this.polar && this.cipher && connection.accessTokenEnc) {
      try {
        await this.polar.deleteUser(
          this.cipher.decrypt(connection.accessTokenEnc),
          connection.externalUserId,
        );
      } catch (err) {
        // The athlete may have revoked access in Polar Flow already; disconnect here anyway.
        this.log.warn(`Polar deregistration failed: ${String(err)}`);
      }
    }
    await this.repos.connections.remove(userId, "polar");
  }

  /** HMAC-SHA256 of the raw body with the webhook secret, hex (constant-time comparison). */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    const secret = this.config.POLAR_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
    const given = Buffer.from(signature.trim().toLowerCase());
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  /**
   * Records a webhook delivery; the work runs in the sync worker so Polar gets its 200 at once.
   * Deliveries are idempotent: the same event again is ignored.
   */
  async receive(payload: PolarWebhookPayload): Promise<string | null> {
    if (payload.event !== "EXERCISE" || !payload.entity_id || payload.user_id === undefined)
      return null;
    const { id } = await this.repos.syncEvents.record({
      vendor: "polar",
      objectId: payload.entity_id,
      aspect: "exercise",
      eventTime: new Date(payload.timestamp ?? Date.now()),
      payload,
    });
    return id;
  }

  /** Handles one recorded webhook event (called by the sync worker). */
  async process(payload: PolarWebhookPayload): Promise<void> {
    if (!payload.entity_id || payload.user_id === undefined) return;
    const connection = await this.repos.connections.byExternalUser(
      "polar",
      String(payload.user_id),
    );
    // A user who disconnected meanwhile: nothing to do.
    if (!connection?.accessTokenEnc) return;
    const { polar, cipher } = this.ready();
    await this.store(
      connection,
      polar,
      cipher.decrypt(connection.accessTokenEnc),
      payload.entity_id,
    );
    await this.repos.connections.markSynced(connection.id);
  }

  private async syncConnection(connection: VendorConnection): Promise<SyncResult> {
    const { polar, cipher } = this.ready();
    if (!connection.accessTokenEnc) throw new NotFoundException("Polar is not connected");
    const token = cipher.decrypt(connection.accessTokenEnc);
    const result: SyncResult = { stored: 0, skipped: 0 };
    try {
      for (const exercise of await polar.listExercises(token)) {
        if (await this.store(connection, polar, token, exercise.id)) result.stored += 1;
        else result.skipped += 1;
      }
      await this.repos.connections.markSynced(connection.id);
    } catch (err) {
      await this.repos.connections.markSynced(
        connection.id,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
    return result;
  }

  /** Downloads one exercise's FIT and stores it as a Polar source; false when unreadable. */
  private async store(
    connection: VendorConnection,
    polar: PolarClient,
    token: string,
    exerciseId: string,
  ): Promise<boolean> {
    const fit = await polar.exerciseFit(token, exerciseId);
    try {
      const parsed = parseActivityFile(fit);
      await this.imports.ingest(connection.userId, parsed, {
        vendor: "polar",
        externalId: exerciseId,
        raw: { exerciseId },
      });
      return true;
    } catch (err) {
      if (err instanceof ImportError) return false;
      throw err;
    }
  }
}
