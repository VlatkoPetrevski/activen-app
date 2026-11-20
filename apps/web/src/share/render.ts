/**
 * Draws a share card on a canvas: background (photo or generated), a hero (route, athlete
 * figure, intervals or one big number), the chosen numbers and the ActiveN mark.
 * Everything is drawn in the card's own pixels (1080 wide), so the export is crisp.
 */
import type { ActivityLapDto, LapIntensity } from "@activen/contracts";
import {
  FORMATS,
  fitRoute,
  type CardFormat,
  type Figure,
  type StatItem,
  type Template,
  type Theme,
} from "./model.js";

export interface CardInput {
  format: CardFormat;
  template: Template;
  theme: Theme;
  photo: CanvasImageSource | null;
  photoSize: { width: number; height: number } | null;
  /** Route on top of the photo (photo template only). */
  photoRoute: boolean;
  title: string;
  subtitle: string;
  stats: StatItem[];
  route: [number, number][] | null;
  laps: ActivityLapDto[];
  figure: Figure;
}

const DISPLAY = '"Nunito Variable", Nunito, "Inter Variable", system-ui, sans-serif';
const TEXT = '"Inter Variable", Inter, system-ui, sans-serif';

interface Palette {
  bg: [string, string, string];
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  line: string;
}

const PALETTES: Record<Theme, Palette> = {
  ember: {
    bg: ["#1f1310", "#7e2f1c", "#e08a4e"],
    ink: "#ffffff",
    muted: "rgba(255,255,255,0.72)",
    accent: "#ffd2b8",
    accent2: "#ffffff",
    line: "rgba(255,255,255,0.12)",
  },
  night: {
    bg: ["#0b1416", "#123a3d", "#1e5a5e"],
    ink: "#ffffff",
    muted: "rgba(255,255,255,0.7)",
    accent: "#ff8a5c",
    accent2: "#9cc3c0",
    line: "rgba(255,255,255,0.08)",
  },
  light: {
    bg: ["#fffaf5", "#fbf1ea", "#fde7df"],
    ink: "#2b2520",
    muted: "rgba(43,37,32,0.62)",
    accent: "#b5482b",
    accent2: "#1e5a5e",
    line: "rgba(43,37,32,0.07)",
  },
};

const LAP_COLORS: Record<LapIntensity, string> = {
  warmup: "#9db8d9",
  active: "#ff6a3d",
  recovery: "#9cc3c0",
  rest: "#9e9e9e",
  cooldown: "#3f8f94",
};

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Largest font size (down to `min`) at which the text fits in `max` pixels. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  family: string,
  size: number,
  max: number,
  min = 24,
): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > max) {
    s -= 4;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function background(ctx: CanvasRenderingContext2D, c: CardInput, p: Palette, W: number, H: number) {
  if (c.template === "photo" && c.photo && c.photoSize) {
    // Cover: fill the card, crop the overflow, centred.
    const k = Math.max(W / c.photoSize.width, H / c.photoSize.height);
    const w = c.photoSize.width * k;
    const h = c.photoSize.height * k;
    ctx.drawImage(c.photo, (W - w) / 2, (H - h) / 2, w, h);
    // Scrims keep white text readable on any photo.
    const bottom = ctx.createLinearGradient(0, H * 0.4, 0, H);
    bottom.addColorStop(0, "rgba(0,0,0,0)");
    bottom.addColorStop(1, "rgba(0,0,0,0.78)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 0, W, H);
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.18);
    top.addColorStop(0, "rgba(0,0,0,0.45)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.18);
    return;
  }
  if (c.template === "photo") {
    ctx.fillStyle = "#2b2520";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, p.bg[0]);
  g.addColorStop(0.55, p.bg[1]);
  g.addColorStop(1, p.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Energy: big soft arcs and a fine diagonal texture.
  ctx.save();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  for (let i = 1; i <= 6; i++) {
    ctx.beginPath();
    ctx.arc(W * 0.85, H * 0.2, i * W * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1.5;
  for (let x = -H; x < W; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H * 0.5, 0);
    ctx.globalAlpha = 0.35;
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  box: { x: number; y: number; width: number; height: number },
  color: string,
  glow: string,
  width: number,
) {
  const xy = fitRoute(pts, box);
  if (xy.length < 2) return;
  const path = new Path2D();
  xy.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = glow;
  ctx.shadowBlur = width * 2.2;
  ctx.strokeStyle = glow;
  ctx.lineWidth = width * 1.9;
  ctx.globalAlpha = 0.45;
  ctx.stroke(path);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = width;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.restore();
  const [sx, sy] = xy[0] as [number, number];
  const [ex, ey] = xy.at(-1) as [number, number];
  ctx.fillStyle = "#2f7d4f";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = width * 0.45;
  ctx.beginPath();
  ctx.arc(sx, sy, width * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#b5482b";
  ctx.beginPath();
  ctx.arc(ex, ey, width * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

type Pt = [number, number];

/** Athlete figures as thick strokes in a unit box (-1…1), scaled to the hero. */
function drawFigure(
  ctx: CanvasRenderingContext2D,
  figure: Figure,
  cx: number,
  cy: number,
  s: number,
  color: string,
  accent: string,
) {
  const P = ([x, y]: Pt): Pt => [cx + x * s, cy + y * s];
  const line = (...pts: Pt[]) => {
    ctx.beginPath();
    pts.map(P).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  const head = (p: Pt, r: number) => {
    const [x, y] = P(p);
    ctx.beginPath();
    ctx.arc(x, y, r * s, 0, Math.PI * 2);
    ctx.fill();
  };
  // Glow disc behind the athlete.
  const glow = ctx.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 1.25);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 1.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s * 0.12;
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = s * 0.06;

  if (figure === "runner" || figure === "walker") {
    const run = figure === "runner";
    // Speed streaks.
    ctx.save();
    ctx.lineWidth = s * 0.04;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accent;
    for (const [y, len] of [
      [-0.55, 0.5],
      [-0.25, 0.75],
      [0.05, 0.45],
      [0.35, 0.6],
    ] as const)
      if (run) line([-0.75 - len, y], [-0.75, y]);
    ctx.restore();
    head([0.18, -0.98], 0.15);
    line([0.1, -0.78], [-0.04, -0.15]);
    line([0.08, -0.7], [0.36, -0.48], [0.6, run ? -0.66 : -0.5]);
    line([0.08, -0.7], [-0.2, -0.46], [run ? -0.44 : -0.3, run ? -0.24 : -0.15]);
    line([-0.04, -0.15], [run ? 0.36 : 0.2, run ? 0.08 : 0.25], [run ? 0.24 : 0.28, 0.62]);
    line([-0.04, -0.15], [-0.24, 0.3], [run ? -0.66 : -0.36, run ? 0.5 : 0.62]);
  } else if (figure === "cyclist") {
    ctx.lineWidth = s * 0.07;
    for (const x of [-0.6, 0.62]) {
      const [wx, wy] = P([x, 0.45]);
      ctx.beginPath();
      ctx.arc(wx, wy, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = accent;
    line([-0.6, 0.45], [-0.12, -0.08], [0.05, 0.45], [-0.6, 0.45]);
    line([-0.12, -0.08], [0.46, -0.12], [0.62, 0.45]);
    line([0.46, -0.12], [0.5, -0.3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.12;
    head([0.48, -0.78], 0.14);
    line([-0.12, -0.2], [0.32, -0.6]);
    line([0.3, -0.58], [0.5, -0.3]);
    line([-0.12, -0.2], [0.22, 0.1], [0.12, 0.48]);
  } else if (figure === "lifter") {
    // Squat with the bar overhead.
    head([0, -0.6], 0.15);
    line([0, -0.42], [0, 0.12]);
    line([0, 0.12], [-0.46, 0.3], [-0.34, 0.7], [-0.5, 0.72]);
    line([0, 0.12], [0.46, 0.3], [0.34, 0.7], [0.5, 0.72]);
    line([-0.12, -0.4], [-0.42, -0.66], [-0.5, -0.94]);
    line([0.12, -0.4], [0.42, -0.66], [0.5, -0.94]);
    ctx.lineWidth = s * 0.06;
    ctx.strokeStyle = accent;
    line([-1.02, -0.94], [1.02, -0.94]);
    ctx.fillStyle = accent;
    for (const x of [-0.92, -0.78, 0.78, 0.92]) {
      const [px, py] = P([x - 0.05, -1.16]);
      const big = Math.abs(x) > 0.85;
      ctx.beginPath();
      ctx.roundRect(px, big ? py : py + s * 0.06, s * 0.1, big ? s * 0.44 : s * 0.32, s * 0.03);
      ctx.fill();
    }
  } else {
    // Swimmer: freestyle over waves.
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = s * 0.05;
    for (const y of [0.25, 0.5]) {
      ctx.beginPath();
      for (let x = -1.1; x <= 1.1; x += 0.05) {
        const [px, py] = P([x, y + Math.sin(x * 6) * 0.05]);
        if (x === -1.1) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    head([0.62, -0.05], 0.15);
    line([0.45, 0.0], [-0.55, 0.1], [-0.95, 0.2]);
    line([0.3, -0.02], [0.45, -0.5], [0.85, -0.55]);
    line([0.1, 0.02], [-0.2, 0.25]);
  }
  ctx.restore();
}

function drawIntervals(
  ctx: CanvasRenderingContext2D,
  laps: ActivityLapDto[],
  box: { x: number; y: number; width: number; height: number },
) {
  const total = laps.reduce((s, l) => s + l.durationInSeconds, 0) || 1;
  const speeds = laps.map((l) => (l.distanceInMeters ?? 0) / Math.max(1, l.durationInSeconds));
  const top = Math.max(...speeds, 0.1);
  const low = Math.min(...speeds.filter((v) => v > 0), top) * 0.75;
  let x = box.x;
  laps.forEach((l, i) => {
    const w = (l.durationInSeconds / total) * box.width;
    const v = speeds[i] ?? 0;
    const h = Math.max(10, ((v - low) / Math.max(0.01, top - low)) * box.height);
    const g = ctx.createLinearGradient(0, box.y + box.height - h, 0, box.y + box.height);
    g.addColorStop(0, LAP_COLORS[l.intensity]);
    g.addColorStop(1, `${LAP_COLORS[l.intensity]}88`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x + 2, box.y + box.height - h, Math.max(2, w - 4), h, 8);
    ctx.fill();
    x += w;
  });
}

function brand(ctx: CanvasRenderingContext2D, p: Palette, onPhoto: boolean, W: number, H: number) {
  const size = 34;
  const x = W - 64;
  const y = H - 64;
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${size}px ${DISPLAY}`;
  ctx.fillStyle = onPhoto ? "#ffffff" : p.ink;
  ctx.globalAlpha = 0.9;
  ctx.fillText("ActiveN", x, y);
  const w = ctx.measureText("ActiveN").width;
  // Mark: the peak from the app icon.
  ctx.strokeStyle = onPhoto ? "#ffffff" : p.accent;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - w - 70, y);
  ctx.lineTo(x - w - 52, y - 30);
  ctx.lineTo(x - w - 38, y - 12);
  ctx.lineTo(x - w - 26, y - 30);
  ctx.lineTo(x - w - 12, y);
  ctx.stroke();
  ctx.restore();
}

/** Draws the whole card. Returns false when the canvas cannot draw (e.g. tests). */
export function renderCard(canvas: HTMLCanvasElement, c: CardInput): boolean {
  const { width: W, height: H } = FORMATS[c.format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const p = PALETTES[c.template === "photo" ? "night" : c.theme];
  const onPhoto = c.template === "photo";
  const ink = onPhoto ? "#ffffff" : p.ink;
  const muted = onPhoto ? "rgba(255,255,255,0.8)" : p.muted;
  ctx.clearRect(0, 0, W, H);
  background(ctx, c, p, W, H);

  const pad = 72;
  const square = c.format === "square";
  const rows = Math.ceil(c.stats.length / 2);
  const statBlock = rows * (square ? 150 : 180);
  const textTop = H - pad - 70 - statBlock - (square ? 110 : 150);
  const hero = {
    x: pad,
    y: pad + 40,
    width: W - pad * 2,
    height: Math.max(220, textTop - pad - 80),
  };

  // Hero.
  if (c.template === "route" && c.route) {
    drawRoute(ctx, c.route, hero, p.accent2, p.accent, 16);
  } else if (c.template === "photo" && c.photoRoute && c.route) {
    const box = { x: W - pad - 300, y: pad + 20, width: 300, height: 300 };
    drawRoute(ctx, c.route, box, "#ffffff", "#ff8a5c", 8);
  } else if (c.template === "figure") {
    const s = Math.min(hero.width, hero.height) * 0.36;
    drawFigure(ctx, c.figure, W / 2, hero.y + hero.height / 2, s, ink, p.accent);
  } else if (c.template === "intervals" && c.laps.length) {
    drawIntervals(ctx, c.laps, {
      x: hero.x,
      y: hero.y + hero.height * 0.2,
      width: hero.width,
      height: hero.height * 0.7,
    });
  } else if (c.template === "bold") {
    const main = c.stats[0];
    if (main) {
      ctx.save();
      ctx.fillStyle = ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const size = fit(ctx, main.value, 900, DISPLAY, square ? 230 : 300, hero.width, 80);
      ctx.font = `900 ${size}px ${DISPLAY}`;
      ctx.fillText(main.value, pad, hero.y + hero.height * 0.75);
      ctx.font = `700 ${Math.round(size * 0.2)}px ${TEXT}`;
      ctx.fillStyle = p.accent;
      ctx.fillText(main.label.toUpperCase(), pad + 6, hero.y + hero.height * 0.75 + size * 0.32);
      ctx.restore();
    }
  }

  // Title and date.
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = muted;
  ctx.font = `600 ${square ? 30 : 34}px ${TEXT}`;
  ctx.fillText(c.subtitle.toUpperCase(), pad, textTop);
  ctx.fillStyle = ink;
  ctx.font = `800 ${square ? 58 : 68}px ${DISPLAY}`;
  ctx.fillText(ellipsize(ctx, c.title, W - pad * 2), pad, textTop + (square ? 70 : 82));
  // Accent bar.
  ctx.fillStyle = onPhoto ? "#ff8a5c" : p.accent;
  ctx.fillRect(pad, textTop + (square ? 96 : 112), 96, 8);

  // Numbers: two columns, label above value.
  const stats = c.template === "bold" ? c.stats.slice(1) : c.stats;
  const colW = (W - pad * 2) / 2;
  const firstRow = textTop + (square ? 150 : 180);
  stats.forEach((st, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = pad + col * colW;
    const y = firstRow + row * (square ? 150 : 180);
    ctx.fillStyle = muted;
    ctx.font = `600 ${square ? 26 : 30}px ${TEXT}`;
    ctx.fillText(st.label.toUpperCase(), x, y);
    ctx.fillStyle = ink;
    const size = fit(ctx, st.value, 800, DISPLAY, square ? 76 : 92, colW - 24, 40);
    ctx.font = `800 ${size}px ${DISPLAY}`;
    ctx.fillText(st.value, x, y + size + 8);
  });
  ctx.restore();

  brand(ctx, p, onPhoto, W, H);
  return true;
}
