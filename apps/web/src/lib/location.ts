/**
 * Where the weather is for. Default: the capital of the athlete's time zone; the athlete can switch
 * to the device location (rounded to ~1 km, kept only in this browser).
 */
export interface Place {
  name: string | null;
  latitude: number;
  longitude: number;
}

const BY_TIME_ZONE: Record<string, Place> = {
  "Europe/Skopje": { name: "Скопје", latitude: 41.9981, longitude: 21.4254 },
  "Europe/Belgrade": { name: "Belgrade", latitude: 44.7866, longitude: 20.4489 },
  "Europe/Sofia": { name: "Sofia", latitude: 42.6977, longitude: 23.3219 },
  "Europe/Athens": { name: "Athens", latitude: 37.9838, longitude: 23.7275 },
  "Europe/Tirane": { name: "Tirana", latitude: 41.3275, longitude: 19.8187 },
  "Europe/Zagreb": { name: "Zagreb", latitude: 45.815, longitude: 15.9819 },
  "Europe/Ljubljana": { name: "Ljubljana", latitude: 46.0569, longitude: 14.5058 },
  "Europe/Vienna": { name: "Vienna", latitude: 48.2082, longitude: 16.3738 },
  "Europe/Berlin": { name: "Berlin", latitude: 52.52, longitude: 13.405 },
  "Europe/London": { name: "London", latitude: 51.5072, longitude: -0.1276 },
  "America/New_York": { name: "New York", latitude: 40.7128, longitude: -74.006 },
};
const FALLBACK = BY_TIME_ZONE["Europe/Skopje"] as Place;
const KEY = "activen.weather.place";

export function defaultPlace(timeZone: string): Place {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const p = JSON.parse(saved) as Place;
      if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) return p;
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return BY_TIME_ZONE[timeZone] ?? FALLBACK;
}

/** Asks the browser for the position once; stores it rounded to two decimals (~1 km). */
export function requestDeviceLocation(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const place: Place = {
          name: null,
          latitude: Math.round(pos.coords.latitude * 100) / 100,
          longitude: Math.round(pos.coords.longitude * 100) / 100,
        };
        try {
          localStorage.setItem(KEY, JSON.stringify(place));
        } catch {
          /* keep for this view only */
        }
        resolve(place);
      },
      (err) => reject(err),
      { maximumAge: 30 * 60_000, timeout: 10_000 },
    );
  });
}
