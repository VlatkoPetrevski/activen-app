import { initials } from "../lib/dates.js";

const COLORS = ["#1E5A5E", "#B5482B", "#7A4FB0", "#2F7D4F", "#B7791F", "#4A6FA5"];

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return (
    <span
      className={`avatar${large ? " l" : ""}`}
      style={{ background: COLORS[hash % COLORS.length] }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
