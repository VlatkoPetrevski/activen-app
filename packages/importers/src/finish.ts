import {
  cleanAltitude,
  cumulativeDistance,
  elevationGain,
  max,
  mean,
  movingTime,
  round,
  speedFromDistance,
  thinStreams,
} from "./derive.js";
import { ImportError, type ImportedActivity } from "./model.js";

/**
 * Completes what a file did not record from its samples (GPX has no totals at all; TCX and some
 * FIT exporters skip a few), thins the samples, and rejects files with nothing to show.
 * File values win: they come from the device's own sensors and algorithms.
 */
export function finishActivity(a: ImportedActivity): ImportedActivity {
  const s = a.streams;
  const last = s.time[s.time.length - 1] ?? 0;
  if (s.altitude) s.altitude = cleanAltitude(s.time, s.altitude);

  if (s.latitude && s.longitude && !s.distance?.some((d) => d != null))
    s.distance = cumulativeDistance(s.latitude, s.longitude);
  if (!s.speed?.some((v) => v != null) && s.distance?.some((d) => d != null))
    s.speed = speedFromDistance(s.time, s.distance);

  const lastDistance = s.distance ? max(s.distance) : null;
  const done: ImportedActivity = {
    ...a,
    durationInSeconds: a.durationInSeconds > 0 ? a.durationInSeconds : last,
    movingDurationInSeconds:
      a.movingDurationInSeconds ?? (s.speed ? movingTime(s.time, s.speed) : null),
    distanceInMeters: a.distanceInMeters ?? round(lastDistance, 1),
    totalElevationGainInMeters:
      a.totalElevationGainInMeters ?? (s.altitude ? elevationGain(s.altitude) : null),
    averageHeartRateInBeatsPerMinute:
      a.averageHeartRateInBeatsPerMinute ?? round(mean(s.heartRate)),
    maxHeartRateInBeatsPerMinute: a.maxHeartRateInBeatsPerMinute ?? max(s.heartRate),
    averagePowerInWatts: a.averagePowerInWatts ?? round(mean(s.power)),
    streams: thinStreams(s),
  };
  if (done.distanceInMeters === 0 && lastDistance == null) done.distanceInMeters = null;
  if (done.durationInSeconds <= 0)
    throw new ImportError("no_activity", "The activity has no duration");
  return done;
}
