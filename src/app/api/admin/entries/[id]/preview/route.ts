import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { queryOne } from "@/lib/db";
import { fail, json, logError } from "@/lib/http";
import { loadDrawingSvg, loadPreviewSvg } from "@/lib/preview";
import type { Stroke } from "@/lib/constants";
import { isUuid } from "@/lib/validation";

/** Server-authorized preview access (preview data stays private in Neon). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/entries/[id]/preview">) {
  const auth = await requireAdmin(req);
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("not_found", "Entry not found.", 404);
  try {
    if (req.nextUrl.searchParams.get("canvas-data") === "1") {
      const drawing = await queryOne<{ strokes: Stroke[]; width: number; height: number }>(
        "select strokes, width, height from drawings where attempt_id = $1",
        [id],
      );
      return drawing ? json(drawing) : fail("not_found", "Entry not found.", 404);
    }
    const download = req.nextUrl.searchParams.get("download") === "1";
    const svg = download ? await loadDrawingSvg(id) : await loadPreviewSvg(id);
    if (!svg) return fail("not_found", "Entry not found.", 404);
    const headers = new Headers({
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    });
    if (download) {
      headers.set("Content-Disposition", `attachment; filename="entry-${id}-drawing.svg"`);
    }
    return new Response(svg, {
      headers,
    });
  } catch (e) {
    logError("admin-preview", e);
    return fail("server_error", "Could not load the preview.", 500);
  }
}
