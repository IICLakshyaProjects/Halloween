import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getContest, query, queryOne, rpc } from "@/lib/db";
import { fail, json, logError } from "@/lib/http";
import { formatInZone } from "@/lib/time";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  try {
    const c = await getContest();
    await rpc("finalize_due_attempts(null)");
    const [counts, audit] = await Promise.all([
      queryOne<{ participants: number; active: number; official: number; empty: number; tests: number }>(
        `select (select count(*)::int from participants) as participants,
                (count(*) filter (where state = 'in_progress'))::int as active,
                (count(*) filter (where state in ('submitted', 'expired')))::int as official,
                (count(*) filter (where state = 'expired_empty'))::int as empty,
                (count(*) filter (where is_test))::int as tests
         from attempts where contest_id = $1`,
        [c.id],
      ),
      query<{ id: number; admin_id: string; action: string; record_type: string; prior_value: unknown; new_value: unknown; created_at: string }>(
        "select id, admin_id, action, record_type, prior_value, new_value, created_at from audit_events order by created_at desc limit 25",
      ),
    ]);
    return json({
      counts: {
        participants: counts?.participants ?? 0,
        activeAttempts: counts?.active ?? 0,
        officialSubmissions: counts?.official ?? 0,
        expiredEmpty: counts?.empty ?? 0,
        testAttempts: counts?.tests ?? 0,
      },
      testing: c.allow_repeat_attempts,
      audit: audit.map((e) => ({ ...e, createdAtText: formatInZone(e.created_at, c.timezone) })),
    });
  } catch (e) {
    logError("admin-dashboard", e);
    return fail("server_error", "Could not load the dashboard.", 500);
  }
}
