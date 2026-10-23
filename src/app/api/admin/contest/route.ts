import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { audit, getContest, query, queryOne } from "@/lib/db";
import { fail, json, logError, readJson } from "@/lib/http";
import { lastStartAt } from "@/lib/status";
import { formatInZone, isValidTimezone, utcToZonedLocal, zonedLocalToUtcIso } from "@/lib/time";

async function view() {
  const c = await getContest();
  const winner = await queryOne<{ attempt_id: string; selected_at: string; entry_ref: string | null }>(
    "select w.attempt_id, w.selected_at, a.entry_ref from winners w left join attempts a on a.id = w.attempt_id where w.contest_id = $1",
    [c.id],
  );
  return {
    id: c.id,
    title: c.title,
    instructions: c.instructions,
    timezone: c.timezone,
    opensAtLocal: utcToZonedLocal(c.opens_at, c.timezone),
    closesAtLocal: utcToZonedLocal(c.closes_at, c.timezone),
    opensAtText: formatInZone(c.opens_at, c.timezone),
    closesAtText: formatInZone(c.closes_at, c.timezone),
    lastStartText: c.closes_at ? formatInZone(lastStartAt(c), c.timezone) : "—",
    entryOpen: c.entry_open,
    allowRepeatAttempts: c.allow_repeat_attempts,
    winner: winner
      ? {
          attemptId: winner.attempt_id,
          selectedAt: winner.selected_at,
          entryRef: winner.entry_ref,
        }
      : null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  try {
    return json(await view());
  } catch (e) {
    logError("admin-contest", e);
    return fail("server_error", "Could not load contest settings.", 500);
  }
}

/** Update title, instructions, window, timezone, entry access. Repeat-attempt testing has its own route. */
export async function PATCH(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  const b = parsed.body;

  try {
    const c = await getContest();
    const update: Record<string, unknown> = {};
    if (b.title !== undefined) {
      if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200) return fail("invalid", "Title must be 1–200 characters.", 400);
      update.title = b.title.trim();
    }
    if (b.instructions !== undefined) {
      if (typeof b.instructions !== "string" || b.instructions.length > 5000) return fail("invalid", "Instructions must be at most 5000 characters.", 400);
      update.instructions = b.instructions;
    }
    const tz = b.timezone !== undefined ? b.timezone : c.timezone;
    if (typeof tz !== "string" || !isValidTimezone(tz)) return fail("invalid", "Unknown timezone.", 400);
    if (b.timezone !== undefined) update.timezone = tz;
    for (const [field, column] of [["opensAtLocal", "opens_at"], ["closesAtLocal", "closes_at"]] as const) {
      if (b[field] === undefined) continue;
      if (b[field] === "" || b[field] === null) update[column] = null;
      else {
        const iso = typeof b[field] === "string" ? zonedLocalToUtcIso(b[field] as string, tz) : null;
        if (!iso) return fail("invalid", "Invalid date/time.", 400);
        update[column] = iso;
      }
    }
    if (b.entryOpen !== undefined) {
      if (typeof b.entryOpen !== "boolean") return fail("invalid", "Invalid entry access value.", 400);
      update.entry_open = b.entryOpen;
    }
    const opens = (update.opens_at ?? c.opens_at) as string | null;
    const closes = (update.closes_at ?? c.closes_at) as string | null;
    if (opens && closes && new Date(closes) <= new Date(opens)) return fail("invalid", "Closing time must be after opening time.", 400);

    if (Object.keys(update).length) {
      const prior = Object.fromEntries(Object.keys(update).map((k) => [k, (c as Record<string, unknown>)[k]]));
      // Column names come from the fixed set assigned above, never from the request.
      const cols = Object.keys(update);
      await query(`update contests set ${cols.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() where id = $1`, [
        c.id,
        ...cols.map((k) => update[k]),
      ]);
      await audit(auth.admin.id, "update_contest", "contest", c.id, prior, update);
    }
    return json(await view());
  } catch (e) {
    logError("admin-contest-update", e);
    return fail("server_error", "Could not save settings.", 500);
  }
}
