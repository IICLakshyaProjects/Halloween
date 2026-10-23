import type { NextRequest } from "next/server";
import { ownedCurrentAttempt } from "@/lib/attempts";
import { rpc } from "@/lib/db";
import { fail, json, logError, rateLimit, readJson } from "@/lib/http";
import { getEmployeeSession } from "@/lib/session";
import { isEditorId, validateOps } from "@/lib/validation";

const ERRORS: Record<string, [number, string]> = {
  expired: [409, "Time is up. Changes made after the deadline were not saved; work that never reached the server may be lost."],
  finalized: [409, "This entry has already been submitted and can no longer be edited."],
  not_editor: [409, "This drawing is being edited in another tab or device."],
  too_many_strokes: [413, "The drawing has too many strokes."],
  too_large: [413, "The drawing is too large."],
  not_found: [404, "Attempt not found."],
};

export async function POST(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const sess = await getEmployeeSession(req);
  if (!sess) return fail("unauthenticated", "Please sign in again.", 401);
  const limited = rateLimit("save", sess.sessionId, 60, 60_000);
  if (limited) return limited;
  if (!isEditorId(parsed.body.editorId)) return fail("bad_request", "Invalid editor id.", 400);
  const ops = validateOps(parsed.body.ops);
  if (!ops.ok) return fail("invalid_ops", ops.message, 400);

  try {
    const a = await ownedCurrentAttempt(sess);
    if (!a) return fail("no_attempt", "No attempt found for this session.", 404);
    const data = await rpc<{ ok: boolean; code?: string; state?: string; last_revision?: number; gap?: boolean }>(
      "apply_ops($1, $2, $3, $4::jsonb, false)",
      [a.id, sess.sessionId, parsed.body.editorId, JSON.stringify(ops.ops)],
    );
    if (!data.ok) {
      const code = data.code ?? "error";
      const [status, message] = ERRORS[code] ?? [400, "Could not save."];
      return fail(code, message, status, { state: data.state });
    }
    return json({ ok: true, revision: data.last_revision, gap: data.gap === true, serverNow: new Date().toISOString() });
  } catch (e) {
    logError("save", e);
    return fail("server_error", "Could not save right now.", 500);
  }
}
