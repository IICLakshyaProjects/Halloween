// Shared by the browser canvas and the server-side SVG preview so both draw the same pixels.
// Every brush is deterministic: textures come from a PRNG seeded with the stroke id, never from Math.random.
import type { Stroke } from "./constants";

export type StyleId =
  | "pencil"
  | "brush"
  | "pen"
  | "calligraphy_brush"
  | "calligraphy_pen"
  | "airbrush"
  | "oil"
  | "crayon"
  | "marker"
  | "natural_pencil"
  | "watercolor";

export const BRUSH_STYLES: { id: StyleId; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "brush", label: "Brush" },
  { id: "calligraphy_brush", label: "Calligraphy brush" },
  { id: "calligraphy_pen", label: "Calligraphy pen" },
  { id: "airbrush", label: "Airbrush" },
  { id: "oil", label: "Oil brush" },
  { id: "crayon", label: "Crayon" },
  { id: "marker", label: "Marker" },
  { id: "natural_pencil", label: "Natural pencil" },
  { id: "watercolor", label: "Watercolor brush" },
];
export const STYLE_IDS: string[] = ["pencil", ...BRUSH_STYLES.map((s) => s.id)];

type Pt = [number, number];
export type Shape =
  | { k: "line"; pts: Pt[]; w: number; a: number; cap: "round" | "square"; dx: number; dy: number }
  | { k: "dots"; pts: Pt[]; r: number; a: number }
  | { k: "poly"; polys: number[][]; a: number };

const MAX_DOTS = 14000;
const r1 = (n: number) => Math.round(n * 10) / 10;

function seedOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points spaced `step` apart along the polyline (first point always included). */
function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let d = step - carry;
    while (d <= len) {
      out.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len]);
      d += step;
    }
    carry = len - (d - step);
  }
  return out;
}

function scatter(s: Stroke, step: number, perSample: number, spread: number, radii: number[], alpha: number): Shape[] {
  const rand = rng(seedOf(s.id));
  const buckets: Pt[][] = radii.map(() => []);
  let total = 0;
  for (const [x, y] of resample(s.points, Math.max(1, step))) {
    for (let j = 0; j < perSample && total < MAX_DOTS; j++, total++) {
      const ang = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * spread;
      buckets[Math.floor(rand() * radii.length)].push([r1(x + Math.cos(ang) * dist), r1(y + Math.sin(ang) * dist)]);
    }
  }
  return buckets.map((pts, i) => ({ k: "dots" as const, pts, r: radii[i], a: alpha })).filter((d) => d.pts.length);
}

function nib(s: Stroke, angleDeg: number, length: number): Shape {
  const a = (angleDeg * Math.PI) / 180;
  const nx = (Math.cos(a) * length) / 2;
  const ny = (Math.sin(a) * length) / 2;
  const polys: number[][] = [];
  const quad = (p0: Pt, p1: Pt) => {
    const q = [p0[0] + nx, p0[1] + ny, p1[0] + nx, p1[1] + ny, p1[0] - nx, p1[1] - ny, p0[0] - nx, p0[1] - ny].map(r1);
    // Normalise winding so overlapping quads union under the non-zero rule instead of cancelling.
    let area = 0;
    for (let i = 0; i < 8; i += 2) area += q[i] * q[(i + 3) % 8] - q[(i + 2) % 8] * q[i + 1];
    polys.push(area < 0 ? [q[6], q[7], q[4], q[5], q[2], q[3], q[0], q[1]] : q);
  };
  const pts = s.points;
  if (pts.length === 1) quad(pts[0], [pts[0][0] + 0.01, pts[0][1]]);
  for (let i = 1; i < pts.length; i++) quad(pts[i - 1], pts[i]);
  return { k: "poly", polys, a: 1 };
}

export function strokeShapes(s: Stroke): Shape[] {
  const pts = s.points;
  const w = s.size;
  const line = (width: number, a: number, cap: "round" | "square" = "round", dx = 0, dy = 0): Shape => ({ k: "line", pts, w: width, a, cap, dx, dy });
  if (s.tool === "eraser") return [line(w, 1)];
  switch (s.style) {
    case "pen":
      return [line(Math.max(1, w * 0.7), 1)];
    case "marker":
      return [line(w * 1.2, 0.55, "square")];
    case "watercolor":
      return [line(w * 1.7, 0.16), line(w * 1.1, 0.2), line(w * 0.5, 0.25)];
    case "oil":
      return [-2, -1, 0, 1, 2].map((i) => line(Math.max(1, w * 0.45), 0.92, "round", i * w * 0.22, i * w * 0.1));
    case "natural_pencil":
      return [line(Math.max(1, w * 0.5), 0.7), ...scatter(s, Math.max(1.5, w / 3), 2, w * 0.6, [0.5, 0.8], 0.55)];
    case "crayon":
      return [line(Math.max(1, w * 0.45), 0.3), ...scatter(s, Math.max(1.2, w / 5), 5, w * 0.5, [0.7, 1.1, 1.6], 0.9)];
    case "airbrush":
      return scatter(s, Math.max(1.5, w / 6), 7, w * 1.1, [0.6, 0.9, 1.2], 0.3);
    case "calligraphy_pen":
      return [nib(s, -45, w * 1.7)];
    case "calligraphy_brush":
      return [nib(s, -30, w * 1.3), line(Math.max(1, w * 0.3), 1)];
    default: // pencil, brush, and strokes saved before brush styles existed
      return [line(w, 1)];
  }
}

export function paintShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], color: string) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineJoin = "round";
  for (const sh of shapes) {
    ctx.globalAlpha = sh.a;
    ctx.beginPath();
    if (sh.k === "line") {
      ctx.lineWidth = sh.w;
      ctx.lineCap = sh.cap;
      const [p0, ...rest] = sh.pts;
      if (!rest.length) {
        ctx.arc(p0[0] + sh.dx, p0[1] + sh.dy, sh.w / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.moveTo(p0[0] + sh.dx, p0[1] + sh.dy);
      for (const p of rest) ctx.lineTo(p[0] + sh.dx, p[1] + sh.dy);
      ctx.stroke();
    } else if (sh.k === "dots") {
      for (const [x, y] of sh.pts) {
        ctx.moveTo(x + sh.r, y);
        ctx.arc(x, y, sh.r, 0, Math.PI * 2);
      }
      ctx.fill();
    } else {
      for (const q of sh.polys) {
        ctx.moveTo(q[0], q[1]);
        for (let i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i + 1]);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.restore();
}

export function shapesToSvg(shapes: Shape[], color: string): string {
  return shapes
    .map((sh) => {
      if (sh.k === "line") {
        const [p0, ...rest] = sh.pts;
        let d = `M${r1(p0[0] + sh.dx)} ${r1(p0[1] + sh.dy)}`;
        if (!rest.length) d += "l0 0.01";
        for (const p of rest) d += `L${r1(p[0] + sh.dx)} ${r1(p[1] + sh.dy)}`;
        return `<path d="${d}" stroke="${color}" stroke-opacity="${sh.a}" stroke-width="${r1(sh.w)}" fill="none" stroke-linecap="${sh.cap === "square" ? "square" : "round"}" stroke-linejoin="round"/>`;
      }
      if (sh.k === "dots") {
        const d = sh.pts.map(([x, y]) => `M${x} ${y}l0.01 0`).join("");
        return `<path d="${d}" stroke="${color}" stroke-opacity="${sh.a}" stroke-width="${r1(sh.r * 2)}" fill="none" stroke-linecap="round"/>`;
      }
      const d = sh.polys.map((q) => `M${q[0]} ${q[1]}` + Array.from({ length: q.length / 2 - 1 }, (_, i) => `L${q[i * 2 + 2]} ${q[i * 2 + 3]}`).join("") + "z").join("");
      return `<path d="${d}" fill="${color}" fill-opacity="${sh.a}"/>`;
    })
    .join("");
}

/** Small S-curve sample of a brush for the brush menu. */
export function sampleSvg(style: StyleId, color: string): string {
  const points: Pt[] = Array.from({ length: 28 }, (_, i) => [r1(10 + i * 3.7), r1(18 + Math.sin(i / 3.2) * 7)]);
  const stroke: Stroke = { id: `sample-${style}`, tool: "pen", style, color, size: 9, points };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 36" width="120" height="36">${shapesToSvg(strokeShapes(stroke), color)}</svg>`;
}

/** Live size preview: the current brush, colour and size drawn as a short wave on white. */
export function previewSvg(style: StyleId, color: string, size: number, eraser: boolean): string {
  const points: Pt[] = Array.from({ length: 24 }, (_, i) => [r1(12 + i * 3.4), r1(18 + Math.sin(i / 2.6) * 6)]);
  const stroke: Stroke = { id: `preview-${style}`, tool: eraser ? "eraser" : "pen", style, color, size: Math.min(size, 28), points };
  const ink = eraser ? "#cbd5e1" : color;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 36" width="100" height="36">${shapesToSvg(strokeShapes(stroke), ink)}</svg>`;
}
