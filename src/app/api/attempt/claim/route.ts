import type { NextRequest } from "next/server";
import { ownedCurrentAttempt } from "@/lib/attempts";
import { query, queryOne, rpc } from "@/lib/db";
import { CANVAS_MAX, MAX_CANVAS_RATIO, MIN_CANVAS_SIDE, canvasDims } from "@/lib/constants";
import { fail, json, logError, rateLimit, readJson } from "@/lib/http";
import { getEmployeeSession } from "@/lib/session";
import { isEditorId } from "@/lib/validation";

/** Active-editor lease: only one tab/device may edit an attempt at a time. */
export async function POST(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const sess = await getEmployeeSession(req);
  if (!sess) return fail("unauthenticated", "Please sign in again.", 401);
  const limited = rateLimit("claim", sess.sessionId, 30, 60_000);
  if (limited) return limited;
  if (!isEditorId(parsed.body.editorId)) return fail("bad_request", "Invalid editor id.", 400);

  try {
    const a = await ownedCurrentAttempt(sess);
    if (!a) return fail("no_attempt", "No attempt found for this session.", 404);
    const data = await rpc<{ ok: boolean; code?: string; state?: string; last_revision?: number }>("claim_editor($1, $2, $3)", [
      a.id,
      sess.sessionId,
      parsed.body.editorId,
    ]);
    if (!data.ok) {
      const msg =
        data.code === "editor_busy"
          ? "This drawing is open for editing in another tab or device. Close it there to continue here."
          : "This attempt is finished.";
      return fail(data.code ?? "conflict", msg, 409, { state: data.state });
    }
    // Before the first stroke the canvas shape may follow the screen this attempt is drawn on.
    const bw = Number(parsed.body.width);
    const bh = Number(parsed.body.height);
    const sized = Number.isInteger(bw) && Number.isInteger(bh) && bw >= MIN_CANVAS_SIDE && bh >= MIN_CANVAS_SIDE && bw <= CANVAS_MAX && bh <= CANVAS_MAX && Math.max(bw, bh) / Math.min(bw, bh) <= MAX_CANVAS_RATIO;
    if ((sized || parsed.body.orientation === "landscape" || parsed.body.orientation === "portrait") && (data.last_revision ?? 0) === 0) {
      const d = sized ? { w: bw, h: bh } : canvasDims(parsed.body.orientation === "landscape" ? "landscape" : "portrait");
      await query("update drawings set width = $2, height = $3, preview_svg = null where attempt_id = $1 and stroke_count = 0 and strokes = '[]'::jsonb", [a.id, d.w, d.h]);
    }
    const canvas = await queryOne<{ width: number; height: number }>("select width, height from drawings where attempt_id = $1", [a.id]);
    return json({ ok: true, revision: data.last_revision, canvas, serverNow: new Date().toISOString() });
  } catch (e) {
    logError("claim", e);
    return fail("server_error", "Could not reserve the canvas. Please try again.", 500);
  }
}
