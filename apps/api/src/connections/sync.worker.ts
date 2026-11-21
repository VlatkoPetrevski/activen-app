import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import type { Repositories } from "@activen/db";
import type { AppConfig } from "../config.js";
import { APP_CONFIG, REPOSITORIES } from "../tokens.js";
import { PolarService, type PolarWebhookPayload } from "./polar.service.js";

/**
 * Processes recorded vendor events (webhooks) outside the request: claimed with
 * `FOR UPDATE SKIP LOCKED`, so several API instances can run it; failures are retried a few
 * times. `kick()` starts a run right after a webhook; the interval catches anything left over.
 */
@Injectable()
export class SyncWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(SyncWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(PolarService) private readonly polar: PolarService,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.SYNC_INTERVAL_SECONDS;
    if (seconds > 0) this.timer = setInterval(() => this.kick(), seconds * 1000);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  kick(): void {
    void this.runOnce().catch((err) => this.log.error(`Sync run failed: ${String(err)}`));
  }

  /** Processes pending events until none are left; returns how many were handled. */
  runOnce(): Promise<number> {
    this.running ??= (async () => {
      let handled = 0;
      try {
        for (;;) {
          const events = await this.repos.syncEvents.claimPending(10);
          if (events.length === 0) return handled;
          for (const event of events) {
            try {
              if (event.vendor === "polar")
                await this.polar.process((event.payload ?? {}) as PolarWebhookPayload);
              await this.repos.syncEvents.markProcessed(event.id);
            } catch (err) {
              await this.repos.syncEvents.markFailed(
                event.id,
                err instanceof Error ? err.message : String(err),
              );
            }
            handled += 1;
          }
        }
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }
}
