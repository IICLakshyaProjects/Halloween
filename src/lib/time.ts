export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function offsetMs(utc: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(utc);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(utc.getTime() / 1000) * 1000;
}

/** "2026-10-31T09:00" interpreted in `tz` -> UTC ISO string (null if invalid). */
export function zonedLocalToUtcIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = guess - offsetMs(new Date(guess), tz);
  ts = guess - offsetMs(new Date(ts), tz);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** UTC ISO -> "YYYY-MM-DDTHH:mm" in `tz` (for datetime-local inputs). */
export function utcToZonedLocal(iso: string | null, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const z = new Date(d.getTime() + offsetMs(d, tz));
  return z.toISOString().slice(0, 16);
}

export function formatInZone(iso: string | null, tz: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) + ` (${tz})`;
}
