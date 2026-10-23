import type { NextRequest } from "next/server";
import { after } from "next/server";
import { ownedCurrentAttempt } from "@/lib/attempts";
import { rpc } from "@/lib/db";
import { fail, json, logError, rateLimit, readJson } from "@/lib/http";
import { generatePreview } from "@/lib/preview";
import { getEmployeeSession } from "@/lib/session";
import { isEditorId, validateOps } from "@/lib/validation";

/** Saves any pending operations and finalizes atomically. Safe to retry: a finalized entry returns the same result. */
export async function POST(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const sess = await getEmployeeSession(req);
  if (!sess) return fail("unauthenticated", "Please sign in again.", 401);
  const limited = rateLimit("submit", sess.sessionId, 10, 60_000);
  if (limited) return limited;
  if (!isEditorId(parsed.body.editorId)) return fail("bad_request", "Invalid editor id.", 400);
  const ops = validateOps(parsed.body.ops ?? []);
  if (!ops.ok) return fail("invalid_ops", ops.message, 400);

  try {
    const a = await ownedCurrentAttempt(sess);
    if (!a) return fail("no_attempt", "No attempt found for this session.", 404);

    // Retry after an uncertain response: return the existing finalized result.
    if (a.state !== "in_progress") return json(finalResult(a));

    const data = await rpc<{ ok: boolean; code?: string; last_revision?: number }>("apply_ops($1, $2, $3, $4::jsonb, true)", [
      a.id,
      sess.sessionId,
      parsed.body.editorId,
      JSON.stringify(ops.ops),
    ]);

    if (!data.ok) {
      if (data.code === "empty") return fail("empty", "Your canvas is empty. Draw something before submitting.", 400);
      if (data.code === "gap") return fail("out_of_sync", "Some changes were not received. Please try again.", 409, { revision: data.last_revision });
      if (data.code === "expired") {
        const final = await ownedCurrentAttempt(sess);
        return json({ ...finalResult(final ?? a), expired: true });
      }
      if (data.code === "not_editor") return fail("not_editor", "This drawing is being edited in another tab or device.", 409);
      return fail(data.code ?? "error", "Could not submit.", 400);
    }

    const final = (await ownedCurrentAttempt(sess)) ?? a;
    after(() => generatePreview(a.id).catch((e) => logError("preview", e)));
    return json(finalResult(final));
  } catch (e) {
    logError("submit", e);
    return fail("server_error", "We could not confirm your submission. Please check your connection and try again.", 500);
  }
}

function finalResult(a: { entry_ref: string; state: string; finalized_at: string | null; completion_method: string | null; is_test: boolean }) {
  return {
    ok: true,
    entryRef: a.entry_ref,
    state: a.state,
    completedAt: a.finalized_at,
    completionMethod: a.completion_method,
    isTest: a.is_test,
  };
}
