import { STYLE_IDS, type StyleId } from "./brushes";
import { MAX_TEXT_LENGTH, MAX_TEXT_LINES, SHAPE_IDS, type ShapeId } from "./shapes";
import {
  ID_PREFIX,
  MAX_BRUSH,
  MAX_FILL_RUNS,
  MAX_NAME_LENGTH,
  MAX_OPS_PER_REQUEST,
  MAX_STROKE_POINTS,
  MIN_BRUSH,
  CANVAS_MAX,
  type DrawOp,
  type Stroke,
} from "./constants";

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}.'’\-,]*$/u;
const SUFFIX_RE = /^[0-9]{4}$/;
export const FULL_ID_RE = /^LA-IND-[0-9]{4}$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function validateName(raw: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof raw !== "string") return { ok: false, message: "Enter your name." };
  const value = raw.trim().normalize("NFC");
  if (!value) return { ok: false, message: "Enter your name." };
  if ([...value].length > MAX_NAME_LENGTH) return { ok: false, message: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  if (!NAME_RE.test(value)) return { ok: false, message: "Name may contain letters, spaces and . ' - , only." };
  return { ok: true, value };
}

export function validateSuffix(raw: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof raw !== "string" || raw === "") return { ok: false, message: "Enter your 4-digit employee ID." };
  if (/[^0-9]/.test(raw)) return { ok: false, message: "Use digits 0–9 only." };
  if (!SUFFIX_RE.test(raw)) return { ok: false, message: "Enter exactly 4 digits." };
  return { ok: true, value: raw };
}

export function fullEmployeeId(suffix: string) {
  return `${ID_PREFIX}${suffix}`;
}

export function nameKey(name: string) {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
export const isEditorId = (v: unknown): v is string => typeof v === "string" && SHORT_ID_RE.test(v);

function finiteNumber(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/** Validates drawing operations. Returns a sanitised copy (only known fields) or an error message. */
export function validateOps(raw: unknown): { ok: true; ops: DrawOp[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: "ops must be a list." };
  if (raw.length > MAX_OPS_PER_REQUEST) return { ok: false, message: `Too many operations in one request (max ${MAX_OPS_PER_REQUEST}).` };
  const ops: DrawOp[] = [];
  let prev = 0;
  for (const o of raw) {
    if (!o || typeof o !== "object") return { ok: false, message: "Invalid operation." };
    const op = o as Record<string, unknown>;
    if (!Number.isInteger(op.seq) || (op.seq as number) < 1 || (op.seq as number) > 1e9) return { ok: false, message: "Invalid operation sequence." };
    const seq = op.seq as number;
    if (prev && seq !== prev + 1) return { ok: false, message: "Operation sequence must be contiguous." };
    prev = seq;
    if (op.t === "clear") {
      ops.push({ seq, t: "clear" });
    } else if (op.t === "undo") {
      if (!isEditorId(op.id)) return { ok: false, message: "Invalid stroke id." };
      ops.push({ seq, t: "undo", id: op.id });
    } else if (op.t === "add") {
      const s = op.stroke as Record<string, unknown> | undefined;
      if (!s || typeof s !== "object") return { ok: false, message: "Invalid stroke." };
      if (!isEditorId(s.id)) return { ok: false, message: "Invalid stroke id." };
      if (!["pen", "eraser", "fill", "shape", "text", "move"].includes(s.tool as string)) return { ok: false, message: "Invalid brush tool." };
      if (s.tool === "shape") {
        if (typeof s.shape !== "string" || !SHAPE_IDS.includes(s.shape)) return { ok: false, message: "Invalid shape." };
        if (typeof s.color !== "string" || !HEX_RE.test(s.color)) return { ok: false, message: "Invalid colour." };
        if (s.fillColor != null && (typeof s.fillColor !== "string" || !HEX_RE.test(s.fillColor))) return { ok: false, message: "Invalid fill colour." };
        if (!finiteNumber(s.size, MIN_BRUSH, MAX_BRUSH)) return { ok: false, message: `Outline size must be ${MIN_BRUSH}–${MAX_BRUSH}.` };
        const b = s.box;
        if (!Array.isArray(b) || b.length !== 4 || !finiteNumber(b[0], 0, CANVAS_MAX) || !finiteNumber(b[2], 0, CANVAS_MAX) || !finiteNumber(b[1], 0, CANVAS_MAX) || !finiteNumber(b[3], 0, CANVAS_MAX)) {
          return { ok: false, message: "Shape is outside the canvas." };
        }
        ops.push({
          seq, t: "add",
          stroke: {
            id: s.id, tool: "shape", shape: s.shape as ShapeId, color: s.color, size: s.size, points: [],
            box: b.map((n: number) => Math.round(n * 10) / 10) as [number, number, number, number],
            fillColor: (s.fillColor as string | null | undefined) ?? null, outline: s.outline !== false,
          },
        });
        continue;
      }
      if (s.tool === "text") {
        if (typeof s.text !== "string") return { ok: false, message: "Enter some text." };
        const text = s.text.replace(/[^\P{C}\n]/gu, "").slice(0, MAX_TEXT_LENGTH);
        if (!text.trim() || text.split("\n").length > MAX_TEXT_LINES) return { ok: false, message: `Text may have at most ${MAX_TEXT_LINES} lines.` };
        if (typeof s.color !== "string" || !HEX_RE.test(s.color)) return { ok: false, message: "Invalid colour." };
        if (!finiteNumber(s.size, 8, 300)) return { ok: false, message: "Invalid text size." };
        const p = Array.isArray(s.points) ? s.points[0] : null;
        if (!Array.isArray(p) || !finiteNumber(p[0], 0, CANVAS_MAX) || !finiteNumber(p[1], 0, CANVAS_MAX)) return { ok: false, message: "Text is outside the canvas." };
        ops.push({
          seq, t: "add",
          stroke: {
            id: s.id, tool: "text", color: s.color, size: Math.round(s.size), text,
            points: [[Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]], bold: s.bold === true, italic: s.italic === true,
          },
        });
        continue;
      }
      if (s.tool === "move") {
        const r = s.rect;
        if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isInteger)) return { ok: false, message: "Invalid selection." };
        const [rx, ry, rw, rh] = r as number[];
        if (rx < 0 || ry < 0 || rw < 1 || rh < 1 || rx + rw > CANVAS_MAX || ry + rh > CANVAS_MAX) return { ok: false, message: "Selection is outside the canvas." };
        if (!Number.isInteger(s.dx) || !Number.isInteger(s.dy) || Math.abs(s.dx as number) > CANVAS_MAX || Math.abs(s.dy as number) > CANVAS_MAX) return { ok: false, message: "Invalid move." };
        ops.push({
          seq, t: "add",
          stroke: { id: s.id, tool: "move", color: "#000000", size: 1, points: [], rect: [rx, ry, rw, rh], dx: s.dx as number, dy: s.dy as number, copy: s.copy === true },
        });
        continue;
      }
      if (s.tool === "fill") {
        if (typeof s.color !== "string" || !HEX_RE.test(s.color)) return { ok: false, message: "Invalid colour." };
        const r = s.runs;
        if (!Array.isArray(r) || r.length === 0 || r.length % 3 !== 0 || r.length > MAX_FILL_RUNS * 3) return { ok: false, message: "Invalid fill." };
        for (let i = 0; i < r.length; i += 3) {
          const [y, x1, x2] = [r[i], r[i + 1], r[i + 2]];
          if (!Number.isInteger(y) || !Number.isInteger(x1) || !Number.isInteger(x2) || y < 0 || y >= CANVAS_MAX || x1 < 0 || x2 < x1 || x2 >= CANVAS_MAX) {
            return { ok: false, message: "Fill is outside the canvas." };
          }
        }
        ops.push({ seq, t: "add", stroke: { id: s.id, tool: "fill", color: s.color, size: 1, points: [], runs: r as number[] } });
        continue;
      }
      if (typeof s.color !== "string" || !HEX_RE.test(s.color)) return { ok: false, message: "Invalid colour." };
      if (!finiteNumber(s.size, MIN_BRUSH, MAX_BRUSH)) return { ok: false, message: `Brush size must be ${MIN_BRUSH}–${MAX_BRUSH}.` };
      if (!Array.isArray(s.points) || s.points.length < 1) return { ok: false, message: "A stroke needs at least one point." };
      if (s.points.length > MAX_STROKE_POINTS) return { ok: false, message: `A stroke may have at most ${MAX_STROKE_POINTS} points.` };
      const points: [number, number][] = [];
      for (const p of s.points) {
        if (!Array.isArray(p) || p.length !== 2 || !finiteNumber(p[0], 0, CANVAS_MAX) || !finiteNumber(p[1], 0, CANVAS_MAX)) {
          return { ok: false, message: "Stroke coordinates are outside the canvas." };
        }
        points.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
      }
      if (s.style !== undefined && (typeof s.style !== "string" || !STYLE_IDS.includes(s.style))) return { ok: false, message: "Invalid brush type." };
      ops.push({
        seq,
        t: "add",
        stroke: { id: s.id, tool: s.tool as Stroke["tool"], color: s.color, size: s.size, points, ...(s.tool === "pen" && s.style ? { style: s.style as StyleId } : {}) },
      });
    } else {
      return { ok: false, message: "Unknown operation type." };
    }
  }
  return { ok: true, ops };
}
