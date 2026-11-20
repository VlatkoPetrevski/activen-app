/** Inline icon set (24px grid, stroke-based) — no external icon font or network request. */
const PATHS = {
  today:
    "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  plan: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  activities: "M3 12h4l3-8 4 16 3-8h4",
  progress: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  coach: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  athletes:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6",
  run: "M13 4a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M7 21l3-6 3 2 1 4M10 15l1-5 4 2 3-1M11 10l-4 1-1 3",
  bike: "M5 17a3 3 0 1 0 0-.1M19 17a3 3 0 1 0 0-.1M5 17l4-7h6l4 7M9 10l-1-3h-2M15 10l-2-4h3",
  gym: "M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12",
  rest: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l5 5L20 7",
  close: "M6 6l12 12M18 6L6 18",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  send: "M4 12l16-8-6 16-2-7z",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  sleep: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10zM14 4h4l-4 4h4",
  hrv: "M3 12h3l2-4 3 9 3-11 2 6h5",
  battery: "M3 8h15v8H3zM21 11v2M6 11h5",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M5 12l7 7 7-7",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  swap: "M7 4l-3 3 3 3M4 7h13M17 20l3-3-3-3M20 17H7",
  alert: "M12 4l9 16H3zM12 10v4M12 17v.5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  sun: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z",
  partlyCloudy:
    "M8 3v1.5M3.5 7.5H2M4.6 4.1l1 1M12 8.2a4 4 0 0 0-7.4 2.3M7 20h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 20z",
  cloud: "M7 19h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 19z",
  fog: "M4 9h16M3 13h18M5 17h14",
  rain: "M7 15h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3",
  snow: "M7 14h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01",
  storm: "M7 14h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 14zM13 15l-3 4h4l-3 4",
  wind: "M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7",
  sunrise: "M12 3v6M9 6l3-3 3 3M4 18h16M6.5 18a5.5 5.5 0 0 1 11 0M2 22h20",
  sunset: "M12 9V3M9 6l3 3 3-3M4 18h16M6.5 18a5.5 5.5 0 0 1 11 0M2 22h20",
  pin: "M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  chevronDown: "M6 9l6 6 6-6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  label,
}: {
  name: IconName;
  size?: number;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function SportIcon({ group }: { group: string }) {
  const name: IconName =
    group === "cycling" ? "bike" : group === "gym" ? "gym" : group === "rest" ? "rest" : "run";
  return (
    <span className={`sport-dot ${group}`}>
      <Icon name={name} />
    </span>
  );
}
