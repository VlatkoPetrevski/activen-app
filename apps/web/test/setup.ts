import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom has no canvas: drawing becomes a no-op instead of a "not implemented" error.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

// The demo builds its weeks around "today": tests run on a fixed Sunday so the data they look for
// (done sessions, the week's totals) does not depend on the day the suite runs. A test can still
// set another date with vi.setSystemTime.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T07:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    /* jsdom without storage */
  }
});
