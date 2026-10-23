import type { NextRequest } from "next/server";
import { getContest, rpc } from "@/lib/db";
import { fail, json, logError, rateLimit, readJson } from "@/lib/http";
import { getEmployeeSession } from "@/lib/session";
import { START_MESSAGES } from "@/lib/status";

export async function POST(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const sess = await getEmployeeSession(req);
  if (!sess) return fail("unauthenticated", "Please sign in again.", 401);
  const limited = rateLimit("start", sess.sessionId, 10, 60_000);
  if (limited) return limited;
  if (parsed.body.acknowledged !== true) return fail("not_acknowledged", "Please acknowledge the rules before starting.", 400);

  try {
    const contest = await getContest();
    const data = await rpc<{ ok: boolean; code?: string }>("start_attempt($1, $2, $3)", [sess.participantId, sess.sessionId, contest.id]);
    if (!data.ok) {
      const code = data.code ?? "error";
      const status = code === "active_exists" || code === "conflict" || code === "already_used" ? 409 : 403;
      return fail(code, START_MESSAGES[code] ?? "Could not start the attempt.", status);
    }
    return json({ ok: true });
  } catch (e) {
    logError("start", e);
    return fail("server_error", "Could not start your attempt. Check your connection and try again.", 500);
  }
}
