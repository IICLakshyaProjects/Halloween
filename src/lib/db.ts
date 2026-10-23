import "server-only";
import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;
let client: Sql | null = null;

/** Neon connection. Reads only DATABASE_URL from the environment; server only. */
function sql(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing environment variable DATABASE_URL");
    client = neon(url);
  }
  return client;
}

function plain<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as T;
}

/** Parameterised query ($1, $2, ...). Timestamps come back as ISO strings. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = (await sql().query(text, params)) as Record<string, unknown>[];
  return rows.map((r) => plain<T>(r));
}

export async function queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** Calls an atomic SQL function that returns jsonb, e.g. rpc("start_attempt($1, $2, $3)", [...]). */
export async function rpc<T = Record<string, unknown>>(call: string, params: unknown[] = []): Promise<T> {
  const row = await queryOne<{ r: T }>(`select ${call} as r`, params);
  if (!row) throw new Error(`${call} returned nothing`);
  return row.r;
}

export async function audit(adminId: string, action: string, recordType: string, recordId: string | null, prior?: unknown, next?: unknown) {
  await query(
    "insert into audit_events (admin_id, action, record_type, record_id, prior_value, new_value) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)",
    [adminId, action, recordType, recordId, prior === undefined ? null : JSON.stringify(prior), next === undefined ? null : JSON.stringify(next)],
  );
}

export type Contest = {
  id: string;
  title: string;
  instructions: string;
  timezone: string;
  opens_at: string | null;
  closes_at: string | null;
  entry_open: boolean;
  duration_seconds: number;
  allow_repeat_attempts: boolean;
};

export async function getContest(): Promise<Contest> {
  const c = await queryOne<Contest>("select * from contests order by created_at limit 1");
  if (!c) throw new Error("Contest not configured (run db/schema.sql).");
  return c;
}
