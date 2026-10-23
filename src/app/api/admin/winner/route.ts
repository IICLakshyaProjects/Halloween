import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getContest, rpc } from "@/lib/db";
import { fail, json, logError, readJson } from "@/lib/http";
import { isUuid } from "@/lib/validation";

/** Select/change the winner. The database function rejects test, empty and unfinished entries. */
export async function POST(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  if (!isUuid(parsed.body.attemptId)) return fail("invalid", "Invalid entry.", 400);
  try {
    const c = await getContest();
    const data = await rpc<{ ok: boolean; code?: string }>("select_winner($1, $2, $3)", [c.id, parsed.body.attemptId, auth.admin.id]);
    if (!data.ok) {
      return data.code === "ineligible"
        ? fail("ineligible", "Only finalized, non-empty official submissions can be selected.", 422)
        : fail("not_found", "Entry not found.", 404);
    }
    return json({ ok: true });
  } catch (e) {
    logError("admin-winner", e);
    return fail("server_error", "Could not select the winner.", 500);
  }
}
