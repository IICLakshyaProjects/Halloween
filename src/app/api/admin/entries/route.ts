import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getContest, query, queryOne } from "@/lib/db";
import { fail, json, logError } from "@/lib/http";
import { formatInZone } from "@/lib/time";

const PAGE_SIZE = 24;
const STATES = ["in_progress", "submitted", "expired", "expired_empty"];

type Row = {
  id: string;
  entry_ref: string;
  state: string;
  is_test: boolean;
  finalized_at: string | null;
  completion_method: string | null;
  stroke_count: number;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Math.min(10_000, Number(sp.get("page")) || 1));
  const status = sp.get("status") ?? "";
  const kind = sp.get("kind") ?? "";
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  if (status && !STATES.includes(status)) return fail("invalid", "Unknown status filter.", 400);
  if (kind && kind !== "official" && kind !== "test") return fail("invalid", "Unknown kind filter.", 400);

  try {
    const c = await getContest();
    const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : "";
    const filter = `
      from attempts a
      join participants p on p.id = a.participant_id
      left join drawings d on d.attempt_id = a.id
      where a.contest_id = $1
        and ($2 = '' or a.state = $2)
        and ($3 = '' or a.is_test = ($3 = 'test'))
        and ($4 = '' or p.name ilike $4 or p.employee_id ilike $4)`;
    const params = [c.id, status, kind, like];
    const [rows, total, winner] = await Promise.all([
      query<Row>(
        `select a.id, a.entry_ref, a.state, a.is_test, a.finalized_at, a.completion_method, coalesce(d.stroke_count, 0)::int as stroke_count
         ${filter} order by a.started_at desc limit ${PAGE_SIZE} offset $5`,
        [...params, (page - 1) * PAGE_SIZE],
      ),
      queryOne<{ n: number }>(`select count(*)::int as n ${filter}`, params),
      queryOne<{ attempt_id: string }>("select attempt_id from winners where contest_id = $1", [c.id]),
    ]);

    return json({
      total: total?.n ?? 0,
      page,
      pageSize: PAGE_SIZE,
      entries: rows.map((a) => ({
        id: a.id,
        entryRef: a.entry_ref,
        state: a.state,
        isTest: a.is_test,
        completionMethod: a.completion_method,
        completedAtText: a.finalized_at ? formatInZone(a.finalized_at, c.timezone) : null,
        hasDrawing: a.stroke_count > 0,
        isWinner: winner?.attempt_id === a.id,
      })),
    });
  } catch (e) {
    logError("admin-entries", e);
    return fail("server_error", "Could not load entries.", 500);
  }
}
