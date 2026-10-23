import type { NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { checkOrigin, json } from "@/lib/http";
import { cookieBase } from "@/lib/session";

export async function POST(req: NextRequest) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const res = json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieBase.secure ? "; Secure" : ""}`,
  );
  return res;
}
