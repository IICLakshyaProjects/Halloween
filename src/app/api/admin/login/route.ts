import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS, checkAdminCredentials, createAdminToken } from "@/lib/admin-auth";
import { clientIp, fail, json, logError, rateLimit, readJson } from "@/lib/http";
import { cookieBase } from "@/lib/session";

export async function POST(req: NextRequest) {
  const limited = rateLimit("admin-login", clientIp(req), 10, 60_000);
  if (limited) return limited;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const { username, password } = parsed.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password || username.length > 200 || password.length > 256) {
    return fail("invalid", "Enter your username and password.", 400);
  }
  try {
    if (!checkAdminCredentials(username.trim(), password)) {
      console.warn("[admin-login] failed sign-in attempt");
      return fail("invalid_credentials", "Invalid username or password.", 401);
    }
    const res = json({ ok: true });
    res.headers.append(
      "Set-Cookie",
      `${ADMIN_COOKIE}=${createAdminToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_TTL_SECONDS}${cookieBase.secure ? "; Secure" : ""}`,
    );
    return res;
  } catch (e) {
    logError("admin-login", e);
    return fail("server_error", "Could not sign in right now.", 500);
  }
}
