import { after } from "next/server";
import { query, rpc } from "@/lib/db";
import { fail, json, logError } from "@/lib/http";
import { generatePreview } from "@/lib/preview";

/**
 * Scheduled (vercel.json): finalize every overdue attempt (no browser needed) and retry missing previews.
 * Safe to expose: it is idempotent, only acts on attempts already past their deadline, and returns counts only.
 */
export async function GET() {
  try {
    const finalized = await rpc<number>("finalize_due_attempts(null)");

    const missing = await query<{ attempt_id: string }>(
      `select d.attempt_id from drawings d join attempts a on a.id = d.attempt_id
       where d.preview_svg is null and d.stroke_count > 0 and a.state <> 'in_progress' limit 50`,
    );
    after(async () => {
      for (const row of missing) await generatePreview(row.attempt_id).catch((e) => logError("preview", e));
    });

    return json({ ok: true, finalized, previewsQueued: missing.length });
  } catch (e) {
    logError("cron-finalize", e);
    return fail("server_error", "Finalization failed.", 500);
  }
}
