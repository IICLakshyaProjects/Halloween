import type { NextRequest } from "next/server";
import { ownedCurrentAttempt } from "@/lib/attempts";
import { queryOne } from "@/lib/db";
import { fail, json, logError } from "@/lib/http";
import { getEmployeeSession } from "@/lib/session";

/** Authoritative state of this session's own attempt (drawing only while in progress). */
export async function GET(req: NextRequest) {
  try {
    const sess = await getEmployeeSession(req);
    if (!sess) return fail("unauthenticated", "Please sign in again.", 401);
    const a = await ownedCurrentAttempt(sess);
    if (!a) return fail("no_attempt", "No attempt found for this session.", 404);

    const attempt = {
      id: a.id,
      state: a.state,
      isTest: a.is_test,
      startedAt: a.started_at,
      deadlineAt: a.deadline_at,
      revision: a.last_revision,
      entryRef: a.entry_ref,
      completedAt: a.finalized_at,
      completionMethod: a.completion_method,
    };
    let strokes: unknown[] = [];
    let canvas: { width: number; height: number } | null = null;
    if (a.state === "in_progress") {
      const d = await queryOne<{ strokes: unknown[] }>("select strokes from drawings where attempt_id = $1", [a.id]);
      strokes = d?.strokes ?? [];
      canvas = await queryOne<{ width: number; height: number }>("select width, height from drawings where attempt_id = $1", [a.id]);
    }
    return json({ attempt, strokes, canvas, serverNow: new Date().toISOString() });
  } catch (e) {
    logError("attempt", e);
    return fail("server_error", "Could not load your attempt. Please try again.", 500);
  }
}
