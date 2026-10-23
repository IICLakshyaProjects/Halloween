import type { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import { clientIp, fail, json, logError, rateLimit, readJson } from "@/lib/http";
import { cookieBase, createSession, getEmployeeSession, SESSION_COOKIE } from "@/lib/session";
import { fullEmployeeId, nameKey, validateName, validateSuffix } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const limited = rateLimit("login", clientIp(req), 20, 60_000);
  if (limited) return limited;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;

  const name = validateName(parsed.body.name);
  if (!name.ok) return fail("invalid_name", name.message, 400, { field: "name" });
  const suffix = validateSuffix(parsed.body.suffix);
  if (!suffix.ok) return fail("invalid_id", suffix.message, 400, { field: "suffix" });
  const employeeId = fullEmployeeId(suffix.value);

  try {
    // Create the participant if new; never overwrite an existing name.
    await query("insert into participants (employee_id, name, name_key) values ($1, $2, $3) on conflict (employee_id) do nothing", [
      employeeId,
      name.value,
      nameKey(name.value),
    ]);
    const p = await queryOne<{ id: string; name_key: string }>("select id, name_key from participants where employee_id = $1", [employeeId]);
    if (!p) throw new Error("participant missing");
    if (p.name_key !== nameKey(name.value)) {
      return fail(
        "name_conflict",
        "This employee ID is already registered with different details. Please contact the organizer.",
        409,
      );
    }

    // Reuse the browser's existing session for this participant so an in-progress attempt stays resumable.
    const existing = await getEmployeeSession(req);
    if (existing && existing.participantId === p.id) return json({ ok: true });

    const s = await createSession(p.id);
    const res = json({ ok: true });
    res.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${s.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${s.maxAge}${cookieBase.secure ? "; Secure" : ""}`,
    );
    return res;
  } catch (e) {
    logError("login", e);
    return fail("server_error", "Could not sign you in right now. Please try again.", 500);
  }
}
