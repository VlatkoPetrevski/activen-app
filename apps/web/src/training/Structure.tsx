import type { PlanEntryDto } from "@activen/contracts";
import { workoutStructure } from "../lib/plan.js";

const HEIGHT = { 1: 30, 2: 45, 3: 62, 4: 82, 5: 100 } as const;

/** Small bar diagram of the session (warm-up, reps, cool-down), colored by HR zone. */
export function Structure({
  entry,
}: {
  entry: Pick<PlanEntryDto, "kind" | "description" | "plannedActivityType" | "structure">;
}) {
  const blocks = workoutStructure(entry);
  if (blocks.length === 0) return null;
  return (
    <div className="workout-structure" aria-hidden>
      {blocks.map((b, i) => (
        <span
          key={i}
          style={{
            flexGrow: b.weight,
            height: `${HEIGHT[b.intensity]}%`,
            background: `var(--zone-${b.intensity})`,
          }}
        />
      ))}
    </div>
  );
}
