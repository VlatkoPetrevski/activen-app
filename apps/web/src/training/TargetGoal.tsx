import type { LocalDate } from "@activen/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { GoalCard } from "./GoalCard.js";
import { PacesProvider } from "./PacesContext.js";
import type { PlanTarget } from "./target.js";

const goalKey = (target: PlanTarget) => [...target.key, "goal"];

/** The target athlete's goal, read once and shared (cached) by the card and the paces. */
export function useTargetGoal(target: PlanTarget) {
  return useQuery({ queryKey: goalKey(target), queryFn: () => target.goal() });
}

/** Named paces in the plan below get the numbers of the target athlete's goal. */
export function TargetPaces({ target, children }: { target: PlanTarget; children: ReactNode }) {
  const goal = useTargetGoal(target);
  return <PacesProvider paces={goal.data?.paces}>{children}</PacesProvider>;
}

/** The goal card for the target athlete (the athlete themselves or their coach edits it). */
export function TargetGoalCard({
  target,
  today,
  onRemove,
}: {
  target: PlanTarget;
  today: LocalDate;
  onRemove?: (() => Promise<unknown>) | undefined;
}) {
  const queryClient = useQueryClient();
  const goal = useTargetGoal(target);
  if (goal.isPending) return null;
  return (
    <GoalCard
      goal={goal.data ?? null}
      today={today}
      onSave={async (input) => {
        queryClient.setQueryData(goalKey(target), await target.saveGoal(input));
      }}
      onRemove={
        onRemove
          ? async () => {
              await onRemove();
              queryClient.setQueryData(goalKey(target), null);
            }
          : undefined
      }
    />
  );
}
