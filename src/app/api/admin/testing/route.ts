import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getContest, rpc } from "@/lib/db";
import { fail, json, logError, readJson } from "@/lib/http";

/** Allow repeat attempts (testing) toggle. Audited inside the database function. */
export async function POST(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  if (typeof parsed.body.enabled !== "boolean") return fail("invalid", "enabled must be true or false.", 400);
  try {
    const c = await getContest();
    const data = await rpc<{ ok: boolean; allow_repeat_attempts: boolean }>("set_repeat_testing($1, $2, $3)", [
      c.id,
      parsed.body.enabled,
      auth.admin.id,
    ]);
    return json({ ok: true, allowRepeatAttempts: data.allow_repeat_attempts });
  } catch (e) {
    logError("admin-testing", e);
    return fail("server_error", "Could not change the setting.", 500);
  }
}
