import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { audit, getContest, query, queryOne } from "@/lib/db";
import { fail, json, logError } from "@/lib/http";
import { formatInZone } from "@/lib/time";

const PAGE_SIZE = 24;
const STATES = ["completed", "in_progress", "submitted", "expired", "expired_empty"];

type Row = {
  id: string;
  entry_ref: string;
  entry_number: number;
  state: string;
  is_test: boolean;
  finalized_at: string | null;
  completion_method: string | null;
  stroke_count: number;
  name: string;
  employee_id: string;
  winner_position?: number;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(sp.get("page")) || 1)));
  const status = sp.get("status") ?? "";
  const kind = sp.get("kind") ?? "";
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  if (status && !STATES.includes(status)) return fail("invalid", "Unknown status filter.", 400);
  if (kind && kind !== "official" && kind !== "test") return fail("invalid", "Unknown kind filter.", 400);

  try {
    const c = await getContest();
    const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : "";
    const filter = `
      from (select *, row_number() over (order by started_at, id)::int as entry_number
            from attempts where contest_id = $1) a
      join participants p on p.id = a.participant_id
      left join drawings d on d.attempt_id = a.id
      where a.contest_id = $1
        and ($2 = '' or a.state = $2 or ($2 = 'completed' and a.state in ('submitted', 'expired')))
        and ($3 = '' or a.is_test = ($3 = 'test'))
        and ($4 = '' or p.name ilike $4 or p.employee_id ilike $4)`;
    const params = [c.id, status, kind, like];
    const [rows, total, winners] = await Promise.all([
      query<Row>(
        `select a.id, a.entry_ref, a.entry_number, a.state, a.is_test, a.finalized_at, a.completion_method, coalesce(d.stroke_count, 0)::int as stroke_count, p.name, p.employee_id
         ${filter} order by a.entry_number desc limit ${PAGE_SIZE} offset $5`,
        [...params, (page - 1) * PAGE_SIZE],
      ),
      queryOne<{ n: number }>(`select count(*)::int as n ${filter}`, params),
      query<Row>(`select a.id, a.entry_ref, a.entry_number, a.state, a.is_test, a.finalized_at, a.completion_method,
          coalesce(d.stroke_count, 0)::int as stroke_count, p.name, p.employee_id, w.position as winner_position
        from winners w
        join (select *, row_number() over (order by started_at, id)::int as entry_number
              from attempts where contest_id = $1) a on a.id = w.attempt_id
        join participants p on p.id = a.participant_id
        left join drawings d on d.attempt_id = a.id
        where w.contest_id = $1 order by w.position, w.selected_at, w.attempt_id`, [c.id]),
    ]);

    // Identities are shown automatically in the protected gallery; retain an audit of disclosure.
    const revealedIds = [...new Set([...rows, ...winners].map((a) => a.id))];
    if (revealedIds.length) {
      await audit(auth.admin.id, "reveal_identities", "contest", c.id, undefined, { attemptIds: revealedIds });
    }
    const winnerPositions = new Map(winners.map((a) => [a.id, a.winner_position]));
    const entryView = (a: Row) => ({
        id: a.id,
        entryRef: a.entry_ref,
        entryNumber: a.entry_number,
        participant: { name: a.name, employeeId: a.employee_id },
        state: a.state,
        isTest: a.is_test,
        completionMethod: a.completion_method,
        completedAtText: a.finalized_at ? formatInZone(a.finalized_at, c.timezone) : null,
        hasDrawing: a.stroke_count > 0,
        isWinner: winnerPositions.has(a.id),
        winnerPosition: winnerPositions.get(a.id) ?? null,
    });
    return json({
      total: total?.n ?? 0,
      page,
      pageSize: PAGE_SIZE,
      entries: rows.map(entryView),
      winners: winners.map(entryView),
    });
  } catch (e) {
    logError("admin-entries", e);
    return fail("server_error", "Could not load entries.", 500);
  }
}
