import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fail, logError } from "@/lib/http";
import { loadPreviewSvg } from "@/lib/preview";
import { isUuid } from "@/lib/validation";

/** Server-authorized preview access (preview data stays private in Neon). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/entries/[id]/preview">) {
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found", "Entry not found.", 404);
  try {
    const svg = await loadPreviewSvg(id);
    if (!svg) return fail("not_found", "Entry not found.", 404);
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    logError("admin-preview", e);
    return fail("server_error", "Could not load the preview.", 500);
  }
}
