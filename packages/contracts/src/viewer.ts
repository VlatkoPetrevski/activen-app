import type { Audience } from "@activen/domain";
import type { ConsentScope, FeedbackDto } from "./responses.js";

/**
 * Who is looking at an athlete's data and what they may see (ADR-0003). The API and the demo
 * both pass one of these to every training read, so a new consent scope is added here once
 * instead of in every query:
 *  - `audience` applies the vendor data-sharing rules (Strava data never reaches a coach);
 *  - `activities` gates activities, laps and progress (the "activities" consent);
 *  - `comments` gates the athlete's own words: check-in comments and activity comments;
 *  - `location` gates GPS routes (the "location" consent).
 */
export interface Viewer {
  readonly audience: Audience;
  readonly activities: boolean;
  readonly comments: boolean;
  readonly location: boolean;
}

export const OWNER: Viewer = Object.freeze({
  audience: "owner",
  activities: true,
  comments: true,
  location: true,
});

export const coachViewer = (scopes: readonly ConsentScope[]): Viewer =>
  Object.freeze({
    audience: "coach",
    activities: scopes.includes("activities"),
    comments: scopes.includes("comments"),
    location: scopes.includes("location"),
  });

/** A check-in as this viewer may see it: ratings always, the written comment with consent. */
export const feedbackAs = (feedback: FeedbackDto, viewer: Viewer): FeedbackDto =>
  viewer.comments ? feedback : { ...feedback, comment: null };
