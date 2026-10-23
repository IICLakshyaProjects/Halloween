import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { query, queryOne } from "./db";

export const SESSION_COOKIE = "hw_session";
const SESSION_TTL_SECONDS = 6 * 60 * 60;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export type EmployeeSession = {
  sessionId: string;
  participantId: string;
  employeeId: string;
  name: string;
};

export async function createSession(participantId: string) {
  const token = randomBytes(32).toString("base64url");
  const row = await queryOne<{ id: string }>(
    "insert into sessions (participant_id, token_hash, expires_at) values ($1, $2, now() + make_interval(secs => $3)) returning id",
    [participantId, hash(token), SESSION_TTL_SECONDS],
  );
  if (!row) throw new Error("Could not create session");
  return { token, sessionId: row.id, maxAge: SESSION_TTL_SECONDS };
}

export async function getEmployeeSession(req: NextRequest): Promise<EmployeeSession | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return queryOne<EmployeeSession>(
    `select s.id as "sessionId", p.id as "participantId", p.employee_id as "employeeId", p.name
     from sessions s join participants p on p.id = s.participant_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hash(token)],
  );
}

export async function deleteSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from sessions where token_hash = $1", [hash(token)]);
}
