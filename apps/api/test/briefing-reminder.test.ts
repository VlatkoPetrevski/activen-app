import { addDays } from "@activen/domain";
import { createTransport } from "nodemailer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SmtpMailer, type OutgoingEmail } from "../src/auth/mailer.js";
import {
  BriefingReminderWorker,
  isDue,
  localClock,
} from "../src/briefing/briefing-reminder.worker.js";
import { loadConfig, ConfigError } from "../src/config.js";
import { MAILER } from "../src/tokens.js";
import { CapturingMailer } from "./auth-helpers.js";
import { planBody, signIn, startHarness, type Harness, type TestUser } from "./harness.js";

const DAY = "2026-11-21";
/** 06:40 in Skopje (UTC+1 in November). */
const AT_0640 = new Date("2026-11-21T05:40:00Z");

/** Captures sign-in links too, and can fail once on demand. */
class FlakyMailer extends CapturingMailer {
  /** The next briefing email to this address fails (other test files share the database). */
  failFor: string | null = null;
  override async send(email: OutgoingEmail): Promise<void> {
    if (this.failFor === email.to && !email.text.includes("#token=")) {
      this.failFor = null;
      throw new Error("SMTP down");
    }
    await super.send(email);
  }
}

let h: Harness;
let mail: FlakyMailer;
beforeAll(async () => {
  mail = new FlakyMailer();
  h = await startHarness({ mailer: mail });
});
afterAll(() => h.close());

async function enable(user: TestUser, time: string, locale: "mk" | "en" = "mk") {
  await h
    .http()
    .patch("/v1/me/settings")
    .set(user.auth)
    .send({ locale, briefingReminder: { enabled: true, time } })
    .expect(200);
}

const worker = () => h.app.get(BriefingReminderWorker);
const to = (user: TestUser) =>
  mail.sent.filter((m) => m.to === user.email && !m.text.includes("#token="));

describe("clock helpers", () => {
  it("reads the local clock and the 3-hour window", () => {
    expect(localClock(AT_0640, "Europe/Skopje")).toBe("06:40");
    expect(localClock(new Date("2026-07-01T04:05:00Z"), "Europe/Skopje")).toBe("06:05");
    expect(localClock(AT_0640, "America/New_York")).toBe("00:40");
    expect(isDue("06:30", "06:40")).toBe(true);
    expect(isDue("06:30", "06:30")).toBe(true);
    expect(isDue("06:30", "06:29")).toBe(false);
    expect(isDue("06:30", "09:29")).toBe(true);
    expect(isDue("06:30", "09:30")).toBe(false);
  });
});

describe("morning email", () => {
  it("goes out once at the athlete's time, with the advice, in their language", async () => {
    const athlete = await signIn(h);
    await enable(athlete, "06:30");
    await h
      .http()
      .post("/v1/me/plan")
      .set(athlete.auth)
      .send(planBody(DAY, { description: "8 × 400 m брзо", plannedDistanceInMeters: 10_000 }))
      .expect(201);
    for (let i = 1; i <= 10; i++)
      await h.repos.wellness.put(athlete.id, {
        calendarDate: addDays(DAY, -i),
        source: "polar",
        sleepDurationInSeconds: 7.5 * 3600,
        sleepScore: null,
        sleepQuality: null,
        restingHeartRate: 48 + (i % 2),
        lastNightHrvMs: null,
        vendorReadiness: null,
      });
    await h.repos.wellness.put(athlete.id, {
      calendarDate: DAY,
      source: "manual",
      sleepDurationInSeconds: 5 * 3600,
      sleepScore: null,
      sleepQuality: null,
      restingHeartRate: 55,
      lastNightHrvMs: null,
      vendorReadiness: null,
    });
    const off = await signIn(h);

    await worker().runOnce(new Date("2026-11-21T05:20:00Z")); // 06:20, too early
    expect(to(athlete)).toHaveLength(0);
    await worker().runOnce(AT_0640);
    await worker().runOnce(AT_0640);
    expect(to(athlete)).toHaveLength(1);
    expect(to(off)).toHaveLength(0);
    const [email] = to(athlete);
    expect(email?.subject).toMatch(/^Замени со лесно · спремност \d+$/);
    expect(email?.text).toContain("Денес: 8 × 400 m брзо");
    expect(email?.text).toContain("Спиеше 5–6 ч");
    expect(email?.text).toContain("Измена: Лесно 7 km, зона 2");
    expect(email?.text).toContain("https://app.activen.test/");
    expect(email?.text).toContain("Профил › Известувања");
  });

  it("asks for sleep and pulse when there is no data; retries after a failed send", async () => {
    const athlete = await signIn(h);
    await enable(athlete, "06:00", "en");
    mail.failFor = athlete.email;
    await worker().runOnce(AT_0640);
    expect(to(athlete)).toHaveLength(0);
    await worker().runOnce(AT_0640);
    const [email] = to(athlete);
    expect(email?.subject).toBe("Good morning — how did you sleep?");
    expect(email?.text).toContain("Enter them here: https://app.activen.test/");
    expect(email?.text).toContain("Good morning, ");
  });

  it("is not sent outside the window or after the athlete turns it off", async () => {
    const athlete = await signIn(h);
    await enable(athlete, "02:00");
    await worker().runOnce(AT_0640);
    expect(to(athlete)).toHaveLength(0);
    await enable(athlete, "06:40");
    await h
      .http()
      .patch("/v1/me/settings")
      .set(athlete.auth)
      .send({ briefingReminder: { enabled: false, time: "06:40" } })
      .expect(200);
    await worker().runOnce(AT_0640);
    expect(to(athlete)).toHaveLength(0);
    expect(h.app.get(MAILER)).toBe(mail);
  });
});

describe("SMTP", () => {
  it("sends from the configured sender", async () => {
    const transport = createTransport({ jsonTransport: true });
    const sent: string[] = [];
    const original = transport.sendMail.bind(transport);
    transport.sendMail = (async (m: Parameters<typeof original>[0]) => {
      const info = await original(m);
      sent.push(String(info.message));
      return info;
    }) as typeof transport.sendMail;
    const mailer = new SmtpMailer(
      {
        host: "smtp.zoho.eu",
        port: 465,
        user: "u",
        password: "p",
        from: "ActiveN <info@activen.app>",
      },
      transport,
    );
    await mailer.send({ to: "a@example.com", subject: "Здраво", text: "Тело" });
    expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({
      from: { address: "info@activen.app", name: "ActiveN" },
      subject: "Здраво",
      text: "Тело",
    });
    expect(
      new SmtpMailer({ host: "localhost", port: 587, user: "u", password: "p", from: "x@y.z" }),
    ).toBeInstanceOf(SmtpMailer);
  });

  it("needs host, user and password", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://x/y", EMAIL_TRANSPORT: "smtp" })).toThrow(
      ConfigError,
    );
    expect(
      loadConfig({
        DATABASE_URL: "postgres://x/y",
        EMAIL_TRANSPORT: "smtp",
        SMTP_HOST: "smtp.zoho.eu",
        SMTP_USER: "info@activen.app",
        SMTP_PASSWORD: "app-password",
      }),
    ).toMatchObject({ SMTP_PORT: 465, EMAIL_FROM: "ActiveN <info@activen.app>" });
  });
});
