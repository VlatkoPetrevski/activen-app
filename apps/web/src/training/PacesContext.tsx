import type { TrainingPaces } from "@activen/domain";
import { createContext, useContext, type ReactNode } from "react";

/**
 * The training paces of the athlete whose plan is shown (from their goal), so a named pace in a
 * workout ("M pace", "5K темпо") is shown with its numbers. Null without a goal.
 */
const PacesContext = createContext<TrainingPaces | null>(null);

export function PacesProvider({
  paces,
  children,
}: {
  paces: TrainingPaces | null | undefined;
  children: ReactNode;
}) {
  return <PacesContext.Provider value={paces ?? null}>{children}</PacesContext.Provider>;
}

export const usePaces = () => useContext(PacesContext);
