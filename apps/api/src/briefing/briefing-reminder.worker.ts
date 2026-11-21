import type { ReminderRecipient, Repositories } from "@activen/db";
import { localDateOf } from "@activen/domain";
import {
  briefingText,
  createFormatter,
  createTranslator,
  labels,
  negotiateLocale,
} from "@activen/i18n";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { OutgoingEmail, Mailer } from "../auth/mailer.js";
import type { AppConfig } from "../config.js";
import { APP_CONFIG, MAILER, REPOSITORIES } from "../tokens.js";
import { BriefingService } from "./briefing.service.js";

/** After the chosen time the email may still go out for this long (e.g. after a restart). */
export const REMINDER_WINDOW_MINUTES = 180;

/** Local "HH:MM" of an instant in a timezone. */
export function localClock(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("hour")}:${part("minute")}`;
}

const minutesOf = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** True from the athlete's chosen time until the window closes, on their local clock. */
export function isDue(chosen: string, nowClock: string): boolean {
  const since = minutesOf(nowClock) - minutesOf(chosen);
  return since >= 0 && since < REMINDER_WINDOW_MINUTES;
}

/**
 * Sends the morning briefing by email at each athlete's local time (ADR-0013). Off for everyone
 * until they enable it in the profile. Each morning is claimed in `notification_log` first, so
 * several API instances or a restart never send it twice; a failed send gives the claim back.
 */
@Injectable()
export class BriefingReminderWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(BriefingReminderWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(BriefingService) private readonly briefings: BriefingService,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.BRIEFING_REMINDER_INTERVAL_SECONDS;
    if (seconds > 0)
      this.timer = setInterval(
        () =>
          void this.runOnce().catch((err) =>
            this.log.error(`Briefing reminders failed: ${String(err)}`),
          ),
        seconds * 1000,
      );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends every email that is due now; returns how many were sent. */
  runOnce(now = new Date()): Promise<number> {
    this.running ??= (async () => {
      let sent = 0;
      try {
        for (const r of await this.repos.notifications.briefingRecipients()) {
          if (!isDue(r.time, localClock(now, r.timeZone))) continue;
          const day = localDateOf(now.toISOString(), r.timeZone);
          if (!(await this.repos.notifications.claim(r.userId, "briefing", day))) continue;
          try {
            await this.mailer.send(await this.compose(r, day));
            sent += 1;
          } catch (err) {
            await this.repos.notifications.release(r.userId, "briefing", day);
            this.log.warn(`Briefing email to ${r.userId} failed: ${String(err)}`);
          }
        }
      } finally {
        this.running = null;
      }
      return sent;
    })();
    return this.running;
  }

  async compose(r: ReminderRecipient, day: string): Promise<OutgoingEmail> {
    const settings = await this.repos.settings.get(r.userId);
    const translator = createTranslator(negotiateLocale({ userPreference: r.locale }));
    const { t } = translator;
    const f = createFormatter(translator, settings.unitSystem);
    const b = await this.briefings.briefing(r.userId, day);
    const text = briefingText(translator, f, b.readiness, b.advice);
    const url = new URL("/", this.config.PUBLIC_WEB_URL).toString();
    const name = r.displayName.split(/\s+/)[0] ?? r.displayName;
    const lines = [t("email.briefing.greeting", { name }), ""];
    if (b.readiness.score !== null && b.readiness.level)
      lines.push(
        t("email.briefing.readiness", {
          score: b.readiness.score,
          level: labels.trainingReadiness(translator, b.readiness.level),
        }),
      );
    if (b.planEntry?.kind === "workout")
      lines.push(t("email.briefing.session", { session: b.planEntry.description }));
    lines.push("", `${text.verdict}. ${text.reason}`);
    if (text.change) lines.push(t("email.briefing.change", { change: text.change }));
    lines.push("");
    lines.push(
      b.readiness.score === null
        ? t("email.briefing.enter", { url })
        : t("email.briefing.open", { url }),
    );
    lines.push("", "—", t("email.briefing.footer"));
    return {
      to: r.email,
      subject:
        b.readiness.score === null
          ? t("email.briefing.subjectNoData")
          : t("email.briefing.subject", { verdict: text.verdict, score: b.readiness.score }),
      text: lines.join("\n"),
    };
  }
}
