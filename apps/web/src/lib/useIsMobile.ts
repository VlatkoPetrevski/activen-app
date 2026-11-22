import { useCallback, useSyncExternalStore } from "react";

/** Phones (and narrow windows): the coach workplace switches to its simplified layout. */
export const MOBILE_QUERY = "(max-width: 720px)";
/** Wide enough to put two panels side by side (the activity's route beside its numbers). */
export const WIDE_QUERY = "(min-width: 961px)";

const matches = (query: string) =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;

/** True while the media query matches; follows rotation and window resizing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => matches(query),
    () => false,
  );
}

/** True on a phone-sized screen. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
