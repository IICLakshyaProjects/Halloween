import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { audit, getContest, queryOne } from "@/lib/db";
import { fail, json, logError } from "@/lib/http";
import { isUuid } from "@/lib/validation";

/** Identity is hidden unless the admin deliberately asks (?reveal=1); each reveal is audited. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/entries/[id]">) {
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found", "Entry not found.", 404);
  try {
    const c = await getContest();
    const a = await queryOne<{
      id: string;
      entry_ref: string;
      state: string;
      is_test: boolean;
      finalized_at: string | null;
      completion_method: string | null;
      name: string;
      employee_id: string;
    }>(
      `select a.id, a.entry_ref, a.state, a.is_test, a.finalized_at, a.completion_method, p.name, p.employee_id
       from attempts a join participants p on p.id = a.participant_id
       where a.id = $1 and a.contest_id = $2`,
      [id, c.id],
    );
    if (!a) return fail("not_found", "Entry not found.", 404);

    let identity: { name: string; employeeId: string } | null = null;
    if (req.nextUrl.searchParams.get("reveal") === "1") {
      identity = { name: a.name, employeeId: a.employee_id };
      await audit(auth.admin.id, "reveal_identity", "attempt", id);
    }
    return json({
      id: a.id, entryRef: a.entry_ref, state: a.state, isTest: a.is_test,
      completionMethod: a.completion_method, completedAt: a.finalized_at, identity,
    });
  } catch (e) {
    logError("admin-entry", e);
    return fail("server_error", "Could not load the entry.", 500);
  }
}
