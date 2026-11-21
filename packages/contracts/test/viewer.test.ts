import { describe, expect, it } from "vitest";
import { coachViewer, feedbackAs, OWNER } from "../src/viewer.js";

describe("viewer", () => {
  const fb = {
    perceivedEffort: 6,
    feel: 4,
    comment: "Heavy legs",
    updatedAt: "2026-11-20T08:00:00Z",
  };

  it("gives the owner everything", () => {
    expect(OWNER).toEqual({ audience: "owner", activities: true, comments: true, location: true });
    expect(feedbackAs(fb, OWNER)).toBe(fb);
  });

  it("maps each consent scope to one permission for coaches", () => {
    expect(coachViewer([])).toEqual({
      audience: "coach",
      activities: false,
      comments: false,
      location: false,
    });
    expect(coachViewer(["activities", "location"])).toMatchObject({
      activities: true,
      comments: false,
      location: true,
    });
    expect(coachViewer(["comments", "sleep_recovery"])).toMatchObject({ comments: true });
    expect(Object.isFrozen(coachViewer([]))).toBe(true);
  });

  it("keeps ratings but hides the written comment without consent", () => {
    expect(feedbackAs(fb, coachViewer(["activities"]))).toEqual({ ...fb, comment: null });
    expect(feedbackAs(fb, coachViewer(["comments"]))).toEqual(fb);
  });
});
