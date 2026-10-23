import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { fail } from "./http";

export const ADMIN_COOKIE = "hw_admin";
export const ADMIN_TTL_SECONDS = 8 * 60 * 60;

export type Admin = { id: string; email: string };

/** Credentials come from the ADMIN_USERNAME / ADMIN_PASSWORD environment variables (never read from files by code). */
function credentials() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Missing environment variable ADMIN_USERNAME or ADMIN_PASSWORD");
  return { username, password };
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function checkAdminCredentials(username: string, password: string) {
  const c = credentials();
  // Evaluate both so timing does not reveal which field was wrong.
  const u = safeEqual(username, c.username);
  const p = safeEqual(password, c.password);
  return u && p;
}

/** Stateless signed session cookie: base64url({u, exp}).hmac, keyed with the admin password. */
export function createAdminToken() {
  const c = credentials();
  const payload = Buffer.from(JSON.stringify({ u: c.username, exp: Date.now() + ADMIN_TTL_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, c.password)}`;
}

export async function getAdmin(req: NextRequest): Promise<Admin | null> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token || token.length > 500) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const c = credentials();
    if (!safeEqual(sig, sign(payload, c.password))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: string; exp?: number };
    if (data.u !== c.username || typeof data.exp !== "number" || data.exp <= Date.now()) return null;
    return { id: c.username, email: c.username };
  } catch {
    return null;
  }
}

export async function requireAdmin(req: NextRequest): Promise<{ admin: Admin } | { res: Response }> {
  const admin = await getAdmin(req);
  if (!admin) return { res: fail("forbidden", "Administrator sign-in required.", 401) };
  return { admin };
}
