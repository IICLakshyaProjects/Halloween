import type { NextRequest } from "next/server";
import { checkOrigin, json } from "@/lib/http";
import { cookieBase, deleteSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const bad = checkOrigin(req);
  if (bad) return bad;
  await deleteSession(req);
  const res = json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieBase.secure ? "; Secure" : ""}`,
  );
  return res;
}
