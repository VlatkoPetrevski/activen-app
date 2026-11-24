import type { LocalDate } from "@activen/domain";
import { eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { athleteGoals, users } from "../schema.js";

export interface GoalRow {
  text: string;
  raceDate: LocalDate | null;
  setBy: { id: string; name: string } | null;
  updatedAt: string;
}

/** One goal per athlete, written by the athlete or their coach. */
export class GoalsRepository {
  constructor(private readonly db: Db) {}

  async get(userId: string): Promise<GoalRow | null> {
    const [row] = await this.db
      .select({
        text: athleteGoals.text,
        raceDate: athleteGoals.raceDate,
        setById: athleteGoals.setBy,
        setByName: users.displayName,
        updatedAt: athleteGoals.updatedAt,
      })
      .from(athleteGoals)
      .leftJoin(users, eq(users.id, athleteGoals.setBy))
      .where(eq(athleteGoals.userId, userId));
    if (!row) return null;
    return {
      text: row.text,
      raceDate: row.raceDate,
      setBy: row.setById ? { id: row.setById, name: row.setByName ?? "" } : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async put(
    userId: string,
    goal: { text: string; raceDate: LocalDate | null },
    setBy: string,
  ): Promise<GoalRow> {
    await this.db
      .insert(athleteGoals)
      .values({ userId, text: goal.text, raceDate: goal.raceDate, setBy })
      .onConflictDoUpdate({
        target: athleteGoals.userId,
        set: { text: goal.text, raceDate: goal.raceDate, setBy, updatedAt: new Date() },
      });
    return (await this.get(userId)) as GoalRow;
  }

  async remove(userId: string): Promise<void> {
    await this.db.delete(athleteGoals).where(eq(athleteGoals.userId, userId));
  }
}
