import type { Stroke } from "./constants";
import { paintShapes, strokeShapes } from "./brushes";
import { paintShape, paintText } from "./shapes";

export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.tool === "fill") {
    const r = s.runs ?? [];
    ctx.fillStyle = s.color;
    ctx.beginPath();
    for (let i = 0; i + 2 < r.length; i += 3) ctx.rect(r[i + 1], r[i], r[i + 2] - r[i + 1] + 1, 1);
    ctx.fill();
    return;
  }
  if (s.tool === "shape") return paintShape(ctx, s);
  if (s.tool === "text") return paintText(ctx, s);
  if (s.tool === "move") {
    const k = ctx.getTransform().a;
    const [x, y, w, h] = s.rect ?? [0, 0, 0, 0];
    const sx = Math.round(x * k), sy = Math.round(y * k), sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    tmp.getContext("2d")!.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!s.copy) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx, sy, sw, sh);
    }
    ctx.drawImage(tmp, Math.round((x + (s.dx ?? 0)) * k), Math.round((y + (s.dy ?? 0)) * k));
    ctx.restore();
    return;
  }
  paintShapes(ctx, strokeShapes(s), s.tool === "eraser" ? "#ffffff" : s.color);
}

export function renderDrawingCanvas(strokes: Stroke[], width: number, height: number) {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new Error("Drawing canvas dimensions are invalid.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the drawing canvas.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  for (const stroke of strokes) paintStroke(ctx, stroke);
  return canvas;
}
