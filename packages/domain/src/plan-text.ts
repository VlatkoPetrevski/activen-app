/**
 * A training plan pasted as text, or read from a text/CSV file, into days of the calendar.
 *
 * Coaches write plans in many shapes; the common ones are read here without AI:
 * - a date at the start of a line: "24.11 10 km лесно", "2026-11-24: ...", "24.11.2026 – ...";
 * - a weekday: "Пон: одмор", "вто 6x1k @5K", "Monday - 10k easy", within the week the plan
 *   starts on, moved on by "Седмица 2" / "Week 2" headers;
 * - "Ден 3" / "Day 3": counted from the start date;
 * - several days on one line, separated by "," or ";" ("пон одмор, вто 6x1k, сре 10 km").
 * A line without a day continues the previous day's description. "Одмор", "rest", "off" make a
 * rest day; the sport is guessed from words (велосипед/bike, сила/gym, пливање/swim, трејл...).
 */
import type { ActivityType } from "./activity-types.js";
import { addDays, weekStart } from "./dates.js";
import type { LocalDate } from "./types.js";

export interface PlanTextDay {
  date: LocalDate;
  kind: "workout" | "rest";
  description: string;
  activityType: ActivityType | null;
}

export interface PlanTextResult {
  days: PlanTextDay[];
  /** Lines that named no day and had no day before them to continue. */
  skipped: string[];
}

const WEEKDAYS: [number, RegExp][] = [
  [0, /^(?:понеделник|пон|monday|mon)(?![\p{L}\d])\.?/iu],
  [1, /^(?:вторник|вто|вт|tuesday|tues|tue)(?![\p{L}\d])\.?/iu],
  [2, /^(?:среда|сре|ср|wednesday|wed)(?![\p{L}\d])\.?/iu],
  [3, /^(?:четврток|чет|чт|thursday|thurs|thur|thu)(?![\p{L}\d])\.?/iu],
  [4, /^(?:петок|пет|пт|friday|fri)(?![\p{L}\d])\.?/iu],
  [5, /^(?:сабота|саб|сб|saturday|sat)(?![\p{L}\d])\.?/iu],
  [6, /^(?:недела|нед|sunday|sun)(?![\p{L}\d])\.?/iu],
];
const WEEK_HEADER = /^(?:седмица|недела|week|wk)\s*(\d{1,2})(?!\d)\s*[:.\-–—]?\s*/iu;
const DAY_N = /^(?:ден|day)\s*(\d{1,3})(?![\p{L}\d])\.?/iu;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/u;
const DMY = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\.?(?![\d:])/u;
const SEPARATOR = /^[\s:.\-–—|,;)]+/u;

const REST = /^(?:одмор|слободно|слободен ден|пауза|rest(?: day)?|off|day off|—|-)$/iu;

const SPORTS: [ActivityType, RegExp][] = [
  ["TRAIL_RUNNING", /трејл|trail/iu],
  ["INDOOR_CYCLING", /тренажер|indoor (?:bike|ride|cycling)|zwift|spin/iu],
  ["CYCLING", /велосипед|вело(?!\p{L})|bike|ride|cycling|возење/iu],
  ["LAP_SWIMMING", /пливање|swim/iu],
  ["STRENGTH_TRAINING", /сила|теретана|кор(?!\p{L})|strength|gym|weights/iu],
  ["YOGA", /јога|yoga|истегнување|stretch/iu],
  ["HIKING", /планинарење|hike|hiking/iu],
  ["WALKING", /пешачење|walk/iu],
];

/** The sport a description is about; running unless another sport is named. */
export function guessSport(description: string): ActivityType {
  return SPORTS.find(([, re]) => re.test(description))?.[0] ?? "RUNNING";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The day a segment starts with, and the text after it; null when it names no day. */
function dayOf(
  segment: string,
  start: LocalDate,
  weekOffset: number,
): { date: LocalDate; rest: string } | null {
  const s = segment.trim();
  const iso = ISO.exec(s);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, rest: s.slice(iso[0].length) };
  const dmy = DMY.exec(s);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let y = dmy[3] ? Number(dmy[3]) : Number(start.slice(0, 4));
      if (y < 100) y += 2000;
      // Without a year, a date before the start (by more than a month) is next year.
      let date = `${y}-${pad(m)}-${pad(d)}`;
      if (!dmy[3] && date < addDays(start, -31)) date = `${y + 1}-${pad(m)}-${pad(d)}`;
      return { date, rest: s.slice(dmy[0].length) };
    }
  }
  const dayN = DAY_N.exec(s);
  if (dayN) return { date: addDays(start, Number(dayN[1]) - 1), rest: s.slice(dayN[0].length) };
  for (const [index, re] of WEEKDAYS) {
    const m = re.exec(s);
    if (m) {
      return {
        date: addDays(weekStart(start), weekOffset * 7 + index),
        rest: s.slice(m[0].length),
      };
    }
  }
  return null;
}

/** Splits a line into day segments where several days share it ("пон одмор, вто 6x1k"). */
function segmentsOf(line: string, start: LocalDate): string[] {
  const parts = line.split(/[;,](?=\s*\S)/u);
  if (parts.length < 2) return [line];
  // Only split when every part starts with a day; "6x1k, одмор 2 мин" stays one description.
  return parts.every((p) => dayOf(p, start, 0)) ? parts : [line];
}

/** Reads a plan written as text into days, starting from `start` (any day of the first week). */
export function parsePlanText(text: string, start: LocalDate): PlanTextResult {
  const days: PlanTextDay[] = [];
  const skipped: string[] = [];
  let weekOffset = 0;
  for (const raw of text.split(/\r?\n/u)) {
    let line = raw.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const header = WEEK_HEADER.exec(line);
    if (header) {
      weekOffset = Number(header[1]) - 1;
      line = line.slice(header[0].length).trim();
      if (!line) continue;
    }
    for (const segment of segmentsOf(line, start)) {
      const day = dayOf(segment, start, weekOffset);
      if (!day) {
        const last = days.at(-1);
        if (last) {
          last.description = `${last.description} ${segment.trim()}`.trim();
          if (last.kind === "rest" && !REST.test(last.description)) last.kind = "workout";
          if (last.kind === "workout") last.activityType = guessSport(last.description);
        } else skipped.push(segment.trim());
        continue;
      }
      const description = day.rest.replace(SEPARATOR, "").trim();
      const rest = !description || REST.test(description);
      days.push({
        date: day.date,
        kind: rest ? "rest" : "workout",
        description: rest ? "" : description,
        activityType: rest ? null : guessSport(description),
      });
    }
  }
  return { days, skipped };
}
