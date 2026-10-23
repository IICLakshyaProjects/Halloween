// Shape + text drawing shared by the browser canvas and the server SVG preview.
import type { Stroke } from "./constants";

export const SHAPES = [
  { id: "line", label: "Line" },
  { id: "curve", label: "Curve" },
  { id: "oval", label: "Oval" },
  { id: "rect", label: "Rectangle" },
  { id: "round_rect", label: "Rounded rectangle" },
  { id: "triangle", label: "Triangle" },
  { id: "right_triangle", label: "Right triangle" },
  { id: "diamond", label: "Diamond" },
  { id: "pentagon", label: "Pentagon" },
  { id: "hexagon", label: "Hexagon" },
  { id: "arrow_right", label: "Right arrow" },
  { id: "arrow_left", label: "Left arrow" },
  { id: "arrow_up", label: "Up arrow" },
  { id: "arrow_down", label: "Down arrow" },
  { id: "star4", label: "4-point star" },
  { id: "star5", label: "5-point star" },
  { id: "star6", label: "6-point star" },
  { id: "heart", label: "Heart" },
  { id: "lightning", label: "Lightning" },
  { id: "callout", label: "Rectangular callout" },
  { id: "oval_callout", label: "Oval callout" },
  { id: "cloud_callout", label: "Cloud callout" },
] as const;
export type ShapeId = (typeof SHAPES)[number]["id"];
export const SHAPE_IDS: string[] = SHAPES.map((s) => s.id);

export const FONT_STACK = "Arial, Helvetica, sans-serif";
export const MAX_TEXT_LENGTH = 200;
export const MAX_TEXT_LINES = 6;

type Pt = [number, number];
const r1 = (n: number) => Math.round(n * 10) / 10;

function regular(n: number, rot = -Math.PI / 2): Pt[] {
  return Array.from({ length: n }, (_, i) => [Math.cos(rot + (i * 2 * Math.PI) / n), Math.sin(rot + (i * 2 * Math.PI) / n)]);
}
function star(n: number, inner: number): Pt[] {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : 1;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}
function ellipse(): Pt[] {
  return Array.from({ length: 72 }, (_, i) => [Math.cos((i * Math.PI) / 36), Math.sin((i * Math.PI) / 36)]);
}
function roundRect(): Pt[] {
  const out: Pt[] = [];
  const rad = 0.22;
  const corners: [number, number, number][] = [[1 - rad, rad, -90], [1 - rad, 1 - rad, 0], [rad, 1 - rad, 90], [rad, rad, 180]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = ((a0 + i * 15) * Math.PI) / 180;
      out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  }
  return out;
}
function ovalCallout(): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 72; i++) {
    if (i > 21 && i < 25) continue; // gap where the tail joins (bottom-left)
    out.push([0.5 + Math.cos((i * Math.PI) / 36) * 0.5, 0.39 + Math.sin((i * Math.PI) / 36) * 0.39]);
    if (i === 21) out.push([0.2, 1]);
  }
  return out;
}
function cloud(): Pt[] {
  return Array.from({ length: 160 }, (_, i) => {
    const t = (i * 2 * Math.PI) / 160;
    const r = 1 + 0.13 * Math.sin(t * 9);
    return [Math.cos(t) * r, Math.sin(t) * r * 0.78];
  });
}
function heart(): Pt[] {
  return Array.from({ length: 64 }, (_, i) => {
    const t = (i * 2 * Math.PI) / 64;
    return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
  });
}
const rot90 = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [1 - y, x]);
const ARROW_R: Pt[] = [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]];

const UNIT: Record<string, Pt[]> = {
  rect: [[0, 0], [1, 0], [1, 1], [0, 1]],
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  right_triangle: [[0, 0], [0, 1], [1, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  arrow_right: ARROW_R,
  arrow_left: ARROW_R.map(([x, y]) => [1 - x, y] as Pt),
  arrow_down: rot90(ARROW_R),
  arrow_up: rot90(ARROW_R).map(([x, y]) => [x, 1 - y] as Pt),
  lightning: [[0.55, 0], [0.15, 0.55], [0.45, 0.55], [0.3, 1], [0.85, 0.4], [0.55, 0.4], [0.75, 0]],
  callout: [[0, 0], [1, 0], [1, 0.75], [0.45, 0.75], [0.2, 1], [0.25, 0.75], [0, 0.75]],
};
const GENERATED: Record<string, () => Pt[]> = {
  oval: ellipse,
  round_rect: roundRect,
  pentagon: () => regular(5),
  hexagon: () => regular(6, 0),
  star4: () => star(4, 0.4),
  star5: () => star(5, 0.4),
  star6: () => star(6, 0.58),
  heart,
  oval_callout: ovalCallout,
  cloud_callout: cloud,
};

/** Outline of a shape fitted into the box dragged from (x1,y1) to (x2,y2). */
export function shapePoints(shape: string, x1: number, y1: number, x2: number, y2: number): { pts: Pt[]; closed: boolean } {
  if (shape === "curve") {
    const pts: Pt[] = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return [r1((1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * x2 + t * t * x2), r1((1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * y1 + t * t * y2)];
    });
    return { pts, closed: false };
  }
  if (shape === "line") return { pts: [[r1(x1), r1(y1)], [r1(x2), r1(y2)]], closed: false };
  const unit = UNIT[shape] ?? GENERATED[shape]?.() ?? UNIT.rect;
  const minX = Math.min(...unit.map((p) => p[0])), maxX = Math.max(...unit.map((p) => p[0]));
  const minY = Math.min(...unit.map((p) => p[1])), maxY = Math.max(...unit.map((p) => p[1]));
  const bx = Math.min(x1, x2), by = Math.min(y1, y2);
  const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
  return {
    pts: unit.map(([x, y]) => [r1(bx + ((x - minX) / (maxX - minX || 1)) * bw), r1(by + ((y - minY) / (maxY - minY || 1)) * bh)] as Pt),
    closed: true,
  };
}

export function textLines(s: Stroke): string[] {
  return (s.text ?? "").split("\n").slice(0, MAX_TEXT_LINES);
}
const fontOf = (s: Stroke) => `${s.italic ? "italic " : ""}${s.bold ? "bold " : ""}${s.size}px ${FONT_STACK}`;

export function paintShape(ctx: CanvasRenderingContext2D, s: Stroke) {
  const b = s.box ?? [0, 0, 0, 0];
  const { pts, closed } = shapePoints(s.shape ?? "rect", b[0], b[1], b[2], b[3]);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
  if (closed && s.fillColor) {
    ctx.fillStyle = s.fillColor;
    ctx.fill();
  }
  if (s.outline !== false) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();
}

export function paintText(ctx: CanvasRenderingContext2D, s: Stroke) {
  const [x, y] = s.points[0] ?? [0, 0];
  ctx.save();
  ctx.fillStyle = s.color;
  ctx.font = fontOf(s);
  ctx.textBaseline = "alphabetic";
  textLines(s).forEach((line, i) => ctx.fillText(line, x, y + s.size * 0.85 + i * s.size * 1.2));
  ctx.restore();
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function shapeSvg(s: Stroke): string {
  const b = s.box ?? [0, 0, 0, 0];
  const { pts, closed } = shapePoints(s.shape ?? "rect", b[0], b[1], b[2], b[3]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("") + (closed ? "z" : "");
  const fill = closed && s.fillColor ? s.fillColor : "none";
  const stroke = s.outline !== false ? `stroke="${s.color}" stroke-width="${s.size}" stroke-linejoin="round" stroke-linecap="round"` : "";
  return `<path d="${d}" fill="${fill}" ${stroke}/>`;
}

export function textSvg(s: Stroke): string {
  const [x, y] = s.points[0] ?? [0, 0];
  return textLines(s)
    .map(
      (line, i) =>
        `<text x="${x}" y="${r1(y + s.size * 0.85 + i * s.size * 1.2)}" font-family="${FONT_STACK}" font-size="${s.size}" fill="${s.color}"${s.bold ? ' font-weight="bold"' : ""}${s.italic ? ' font-style="italic"' : ""} xml:space="preserve">${esc(line)}</text>`,
    )
    .join("");
}

/** Tiny SVG path for a shape button icon. */
export function shapeIconPath(shape: string) {
  const { pts, closed } = shapePoints(shape, 3, 3, 21, 21);
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("") + (closed ? "z" : "");
}
