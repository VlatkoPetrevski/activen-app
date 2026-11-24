import {
  goalPaces,
  parseGoal,
  type LocalDate,
  type RaceGoal,
  type TrainingPaces,
} from "@activen/domain";

/** The athlete's goal with what it means: the race read from the text and the training paces. */
export interface GoalDto {
  text: string;
  raceDate: LocalDate | null;
  /** Who wrote it last (the athlete or the coach); null when that account is gone. */
  setBy: { id: string; name: string } | null;
  updatedAt: string;
  /** Null when the text names no race and time ("трчање за здравје"). */
  race: RaceGoal | null;
  paces: TrainingPaces | null;
}

export function goalView(row: {
  text: string;
  raceDate: LocalDate | null;
  setBy: { id: string; name: string } | null;
  updatedAt: string;
}): GoalDto {
  const race = parseGoal(row.text);
  return { ...row, race, paces: race ? goalPaces(race) : null };
}
