import "server-only";
import type { NextRequest } from "next/server";
import { MAX_BODY_BYTES } from "./constants";

export function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export const fail = (code: string, message: string, status: number, extra?: Record<string, unknown>) =>
  json({ error: { code, message }, ...extra }, status);

/** Reject cross-site mutating requests (cookies are SameSite=Lax; this is defence in depth). */
export function checkOrigin(req: NextRequest): Response | null {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return fail("bad_origin", "Cross-site request rejected.", 403);
    } catch {
      return fail("bad_origin", "Cross-site request rejected.", 403);
    }
  }
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return fail("bad_content_type", "Requests must be JSON.", 415);
  return null;
}

export async function readJson(
  req: NextRequest,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  const bad = checkOrigin(req);
  if (bad) return { ok: false, res: bad };
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return { ok: false, res: fail("too_large", "Request is too large.", 413) };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, res: fail("too_large", "Request is too large.", 413) };
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return { ok: true, body };
  } catch {
    return { ok: false, res: fail("bad_json", "Invalid request body.", 400) };
  }
}

// Per-instance sliding-window limiter. On multi-instance hosting back this with a shared store (e.g. Redis).
const hits = new Map<string, number[]>();
export function rateLimit(bucket: string, key: string, limit: number, windowMs: number): Response | null {
  const now = Date.now();
  const k = `${bucket}:${key}`;
  const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(k, arr);
    return fail("rate_limited", "Too many requests. Please wait a moment and try again.", 429);
  }
  arr.push(now);
  hits.set(k, arr);
  if (hits.size > 5000) for (const [kk, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(kk);
  return null;
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function logError(scope: string, err: unknown) {
  console.error(`[${scope}]`, err instanceof Error ? err.message : err);
}
