import type { NextRequest } from "next/server";
import { fail, json, logError } from "@/lib/http";
import { getEmployeeSession } from "@/lib/session";
import { employeeStatus } from "@/lib/status";

export async function GET(req: NextRequest) {
  try {
    const sess = await getEmployeeSession(req);
    if (!sess) return json({ authenticated: false });
    return json({ authenticated: true, ...(await employeeStatus(sess)) });
  } catch (e) {
    logError("status", e);
    return fail("server_error", "Could not load your status. Please try again.", 500);
  }
}
