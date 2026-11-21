import type { Db } from "../client.js";
import { ActivitiesRepository } from "./activities.js";
import { ActivityFilesRepository } from "./activity-files.js";
import { CoachingRepository } from "./coaching.js";
import { CommentsRepository } from "./comments.js";
import { FeedbackRepository } from "./feedback.js";
import { HrZonesRepository } from "./hr-zones.js";
import { LoginTokensRepository, type LoginTokenPolicy } from "./login-tokens.js";
import { PlansRepository } from "./plans.js";
import { SessionsRepository, type SessionPolicy } from "./sessions.js";
import { SettingsRepository } from "./settings.js";
import { SyncEventsRepository } from "./sync-events.js";
import { UsersRepository } from "./users.js";

export interface Repositories {
  users: UsersRepository;
  settings: SettingsRepository;
  activities: ActivitiesRepository;
  activityFiles: ActivityFilesRepository;
  hrZones: HrZonesRepository;
  plans: PlansRepository;
  feedback: FeedbackRepository;
  syncEvents: SyncEventsRepository;
  coaching: CoachingRepository;
  sessions: SessionsRepository;
  loginTokens: LoginTokensRepository;
  comments: CommentsRepository;
}

export interface RepositoryOptions {
  sessionPolicy?: SessionPolicy;
  loginTokenPolicy?: LoginTokenPolicy;
}

export function createRepositories(db: Db, options: RepositoryOptions = {}): Repositories {
  return {
    users: new UsersRepository(db),
    settings: new SettingsRepository(db),
    activities: new ActivitiesRepository(db),
    activityFiles: new ActivityFilesRepository(db),
    hrZones: new HrZonesRepository(db),
    plans: new PlansRepository(db),
    feedback: new FeedbackRepository(db),
    syncEvents: new SyncEventsRepository(db),
    coaching: new CoachingRepository(db),
    sessions: new SessionsRepository(db, options.sessionPolicy),
    loginTokens: new LoginTokensRepository(db, options.loginTokenPolicy),
    comments: new CommentsRepository(db),
  };
}
