import "server-only";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Stroke } from "./constants";
import { shapesToSvg, strokeShapes } from "./brushes";
import { shapeSvg, textSvg } from "./shapes";
import { query, queryOne } from "./db";

/** Fixed white background, fixed orientation. Eraser strokes are white, matching the canvas. */
export function renderSvg(strokes: Stroke[], width = CANVAS_WIDTH, height = CANVAS_HEIGHT) {
  let body = `<rect width="100%" height="100%" fill="#ffffff"/>`;
  let defs = "";
  let layer = 0;
  for (const s of strokes) {
    if (s.tool === "move" && s.rect) {
      // Reproduce the pixel move/copy by re-using everything drawn so far, clipped to the selection.
      const [x, y, w, h] = s.rect;
      const n = ++layer;
      defs += `<g id="L${n}">${body}</g><clipPath id="C${n}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;
      body =
        `<use href="#L${n}"/>` +
        (s.copy ? "" : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`) +
        `<g transform="translate(${s.dx ?? 0} ${s.dy ?? 0})"><g clip-path="url(#C${n})"><use href="#L${n}"/></g></g>`;
      continue;
    }
    if (s.tool === "fill") {
      const r = s.runs ?? [];
      let d = "";
      for (let i = 0; i + 2 < r.length; i += 3) d += `M${r[i + 1]} ${r[i]}h${r[i + 2] - r[i + 1] + 1}v1h-${r[i + 2] - r[i + 1] + 1}z`;
      body += `<path d="${d}" fill="${s.color}"/>`;
    } else if (s.tool === "shape") body += shapeSvg(s);
    else if (s.tool === "text") body += textSvg(s);
    else body += shapesToSvg(strokeShapes(s), s.tool === "eraser" ? "#ffffff" : s.color);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}

/** Idempotent: regenerates from saved data; never alters the drawing itself. */
export async function generatePreview(attemptId: string): Promise<boolean> {
  const d = await queryOne<{ strokes: Stroke[]; width: number; height: number }>(
    "select strokes, width, height from drawings where attempt_id = $1",
    [attemptId],
  );
  if (!d) return false;
  await query("update drawings set preview_svg = $2 where attempt_id = $1", [attemptId, renderSvg(d.strokes)]);
  return true;
}

export async function loadPreviewSvg(attemptId: string): Promise<string | null> {
  const d = await queryOne<{ preview_svg: string | null; strokes: Stroke[]; width: number; height: number }>(
    "select preview_svg, strokes, width, height from drawings where attempt_id = $1",
    [attemptId],
  );
  if (!d) return null;
  return d.preview_svg ?? renderSvg(d.strokes, d.width, d.height);
}
