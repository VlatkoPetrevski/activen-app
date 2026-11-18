import type { Db } from "../client.js";
import { ActivitiesRepository } from "./activities.js";
import { CoachingRepository } from "./coaching.js";
import { FeedbackRepository } from "./feedback.js";
import { HrZonesRepository } from "./hr-zones.js";
import { PlansRepository } from "./plans.js";
import { SettingsRepository } from "./settings.js";
import { SyncEventsRepository } from "./sync-events.js";
import { UsersRepository } from "./users.js";

export interface Repositories {
  users: UsersRepository;
  settings: SettingsRepository;
  activities: ActivitiesRepository;
  hrZones: HrZonesRepository;
  plans: PlansRepository;
  feedback: FeedbackRepository;
  syncEvents: SyncEventsRepository;
  coaching: CoachingRepository;
}

export function createRepositories(db: Db): Repositories {
  return {
    users: new UsersRepository(db),
    settings: new SettingsRepository(db),
    activities: new ActivitiesRepository(db),
    hrZones: new HrZonesRepository(db),
    plans: new PlansRepository(db),
    feedback: new FeedbackRepository(db),
    syncEvents: new SyncEventsRepository(db),
    coaching: new CoachingRepository(db),
  };
}
