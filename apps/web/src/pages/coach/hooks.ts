import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../api/ApiContext.js";

export function useCoachAthletes() {
  const api = useApi();
  return useQuery({ queryKey: ["coach", "athletes"], queryFn: () => api.coachAthletes() });
}
