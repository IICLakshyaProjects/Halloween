// Shared between server and client code.
import type { StyleId } from "./brushes";
import type { ShapeId } from "./shapes";
export const ID_PREFIX = "LA-IND-";
export const ATTEMPT_SECONDS = 900;
export const CANVAS_WIDTH = 900;
export const CANVAS_HEIGHT = 1600; // portrait 9:16, the shape of a phone held upright
/** Each attempt gets the canvas shape that suits the screen it starts on: portrait 9:16 or landscape 4:3. */
export const CANVAS_MAX = 1600;
export type Orientation = "portrait" | "landscape";
export const MIN_CANVAS_SIDE = 400;
export const MAX_CANVAS_RATIO = 2.6;
/** Canvas that matches the free screen area exactly (long side 1600), so it fills phones, tablets and desktops alike. */
export const fitDims = (freeW: number, freeH: number) => {
  const r = Math.min(MAX_CANVAS_RATIO, Math.max(1 / MAX_CANVAS_RATIO, freeW / Math.max(1, freeH)));
  return r < 1 ? { w: Math.round(CANVAS_MAX * r), h: CANVAS_MAX } : { w: CANVAS_MAX, h: Math.round(CANVAS_MAX / r) };
};
export const canvasDims = (o: Orientation) => (o === "landscape" ? { w: 1600, h: 1200 } : { w: CANVAS_WIDTH, h: CANVAS_HEIGHT });

export const MAX_NAME_LENGTH = 100;
export const MAX_STROKE_POINTS = 1500;
export const MAX_OPS_PER_REQUEST = 200;
export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_FILL_RUNS = 8000;
export const MIN_BRUSH = 1;
export const MAX_BRUSH = 48;

export const PALETTE = [
  "#111111",
  "#ff7518",
  "#7c3aed",
  "#16a34a",
  "#dc2626",
  "#facc15",
  "#2563eb",
  "#92400e",
  "#ec4899",
  "#6b7280",
];

/** pen/eraser: freehand points. fill: `runs` is a flat [y, x1, x2, ...] list of filled pixel spans (points is empty). */
export type Stroke = {
  id: string;
  tool: "pen" | "eraser" | "fill" | "shape" | "text" | "move";
  color: string;
  size: number;
  points: [number, number][];
  runs?: number[];
  /** Brush type for pen strokes (absent on older strokes = plain brush). */
  style?: StyleId;
  /** shape: kind, dragged box [x1,y1,x2,y2], optional fill colour, and whether the outline is drawn. */
  shape?: ShapeId;
  box?: [number, number, number, number];
  fillColor?: string | null;
  outline?: boolean;
  /** text: `points[0]` is the top-left; `size` is the font size in canvas pixels. */
  text?: string;
  bold?: boolean;
  italic?: boolean;
  /** move: copy/move the pixels in rect [x,y,w,h] by (dx,dy). */
  rect?: [number, number, number, number];
  dx?: number;
  dy?: number;
  copy?: boolean;
};

export type DrawOp =
  | { seq: number; t: "add"; stroke: Stroke }
  | { seq: number; t: "undo"; id: string }
  | { seq: number; t: "clear" };

export type AttemptState = "in_progress" | "submitted" | "expired" | "expired_empty";
