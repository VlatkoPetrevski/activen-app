import type { LocalDate } from "@activen/domain";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../client.js";
import { athleteSettings, notificationLog, users } from "../schema.js";

export type NotificationKind = "briefing";

export interface ReminderRecipient {
  userId: string;
  email: string;
  displayName: string;
  locale: string | null;
  timeZone: string;
  /** Local "HH:MM". */
  time: string;
}

/** At-most-once notifications and the people who asked for them. */
export class NotificationsRepository {
  constructor(private readonly db: Db) {}

  /**
   * Claims the notification for that day. True only for the first caller, so two workers (or a
   * restart) never send the same morning email twice.
   */
  async claim(userId: string, kind: NotificationKind, calendarDate: LocalDate): Promise<boolean> {
    const rows = await this.db
      .insert(notificationLog)
      .values({ userId, kind, calendarDate })
      .onConflictDoNothing()
      .returning({ userId: notificationLog.userId });
    return rows.length === 1;
  }

  /** Gives a claim back when sending failed, so the next run retries. */
  async release(userId: string, kind: NotificationKind, calendarDate: LocalDate): Promise<void> {
    await this.db
      .delete(notificationLog)
      .where(
        and(
          eq(notificationLog.userId, userId),
          eq(notificationLog.kind, kind),
          eq(notificationLog.calendarDate, calendarDate),
        ),
      );
  }

  /** Athletes with the morning email turned on and an email address. */
  async briefingRecipients(): Promise<ReminderRecipient[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        locale: athleteSettings.locale,
        timeZone: athleteSettings.timeZone,
        time: athleteSettings.briefingTime,
      })
      .from(athleteSettings)
      .innerJoin(users, eq(users.id, athleteSettings.userId))
      .where(
        and(
          eq(athleteSettings.briefingReminder, true),
          isNotNull(users.email),
          isNull(users.deletedAt),
        ),
      );
    return rows.flatMap((r) => (r.email ? [{ ...r, email: r.email }] : []));
  }
}
