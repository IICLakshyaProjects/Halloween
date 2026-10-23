"use client";

import { useCallback, useEffect, useState } from "react";

type Contest = {
  title: string; instructions: string; timezone: string;
  opensAtLocal: string; closesAtLocal: string; opensAtText: string; closesAtText: string; lastStartText: string;
  entryOpen: boolean; allowRepeatAttempts: boolean;
  winner: { attemptId: string; selectedAt: string; entryRef: string | null } | null;
};
type Dashboard = {
  counts: { participants: number; activeAttempts: number; officialSubmissions: number; expiredEmpty: number; testAttempts: number };
  audit: { id: number; admin_id: string; action: string; prior_value: unknown; new_value: unknown; createdAtText: string }[];
};
type Entry = { id: string; entryRef: string; state: string; isTest: boolean; completionMethod: string | null; completedAtText: string | null; hasDrawing: boolean; isWinner: boolean };

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? "Request failed."), { status: res.status });
  return data as T;
}

const STATE_LABEL: Record<string, string> = { in_progress: "In progress", submitted: "Submitted", expired: "Expired", expired_empty: "Expired (empty)" };

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"dashboard" | "settings" | "entries">("dashboard");
  const [contest, setContest] = useState<Contest | null>(null);

  const loadContest = useCallback(async () => {
    try {
      setContest(await api<Contest>("/api/admin/contest"));
      setAuthed(true);
    } catch (e) {
      if ((e as { status?: number }).status === 401) setAuthed(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadContest();
  }, [loadContest]);

  if (authed === null) return <p className="muted">Loading…</p>;
  if (!authed) return <AdminLogin onDone={loadContest} />;
  if (!contest) return <p className="muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">🎃 Admin — {contest.title}</h1>
        <button className="btn" onClick={async () => { await api("/api/admin/logout", "POST", {}); setAuthed(false); setContest(null); }}>Sign out</button>
      </header>
      {contest.allowRepeatAttempts && (
        <div className="banner banner-test" role="status">
          Testing Mode is ON — repeat attempts are available to every participant and are marked as test entries. Turn it OFF before official participation.
        </div>
      )}
      <nav className="flex gap-2" aria-label="Admin sections">
        {(["dashboard", "settings", "entries"] as const).map((t) => (
          <button key={t} className="btn" aria-pressed={tab === t} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </nav>
      {tab === "dashboard" && <DashboardTab contest={contest} reload={loadContest} />}
      {tab === "settings" && <SettingsTab contest={contest} reload={loadContest} />}
      {tab === "entries" && <EntriesTab contest={contest} reload={loadContest} />}
    </div>
  );
}

function AdminLogin({ onDone }: { onDone: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card mx-auto mt-10 flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError("");
        try { await api("/api/admin/login", "POST", { username, password }); await onDone(); }
        catch (err) { setError(err instanceof Error ? err.message : "Sign-in failed."); }
        finally { setBusy(false); }
      }}
    >
      <h1 className="text-2xl font-bold">Administrator sign-in</h1>
      <div><label className="label" htmlFor="username">Username</label><input id="username" type="text" autoComplete="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
      <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function DashboardTab({ contest, reload }: { contest: Contest; reload: () => Promise<void> }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [confirmTesting, setConfirmTesting] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api<Dashboard>("/api/admin/dashboard")); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load."); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async (enabled: boolean) => {
    try { await api("/api/admin/testing", "POST", { enabled }); await Promise.all([reload(), load()]); setConfirmTesting(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
  };

  const c = data?.counts;
  const tiles: [string, number | undefined][] = [
    ["Participants", c?.participants], ["Active attempts", c?.activeAttempts], ["Official submissions", c?.officialSubmissions],
    ["Expired-empty (official)", c?.expiredEmpty], ["Test attempts", c?.testAttempts],
  ];
  return (
    <div className="flex flex-col gap-4">
      {error && <p className="err" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([label, n]) => (
          <div key={label} className="card"><div className="muted text-sm">{label}</div><div className="text-3xl font-bold">{n ?? "…"}</div></div>
        ))}
      </div>
      <section className="card flex flex-col gap-3">
        <h2 className="text-xl font-bold">Entry access &amp; testing</h2>
        <p>Entry access: <strong>{contest.entryOpen ? "Open" : "Closed"}</strong> · Last permissible start: <strong>{contest.lastStartText}</strong></p>
        <p>Allow repeat attempts (testing): <strong>{contest.allowRepeatAttempts ? "ON" : "OFF"}</strong></p>
        <div className="banner banner-warn">While ON, repeat attempts are available to every participant. Use a separate staging environment for testing when available.</div>
        <div className="flex flex-wrap gap-3">
          <button className="btn" onClick={async () => { await api("/api/admin/contest", "PATCH", { entryOpen: !contest.entryOpen }); await reload(); }}>
            {contest.entryOpen ? "Close entry access" : "Open entry access"}
          </button>
          {contest.allowRepeatAttempts ? (
            <button className="btn btn-primary" onClick={() => void toggle(false)}>Turn OFF Allow repeat attempts (testing)</button>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmTesting(true)}>Turn ON Allow repeat attempts (testing)</button>
          )}
        </div>
        {confirmTesting && (
          <div role="alertdialog" className="banner banner-bad flex flex-wrap items-center gap-3">
            Enable testing mode? Every participant will be able to start repeat attempts, all marked as test entries.
            <button className="btn btn-danger" onClick={() => void toggle(true)}>Enable testing</button>
            <button className="btn" onClick={() => setConfirmTesting(false)}>Cancel</button>
          </div>
        )}
        <p className="muted text-sm">Closing entry access does not cancel existing attempts or change their deadlines.</p>
      </section>
      <section className="card">
        <h2 className="mb-2 text-xl font-bold">Winner</h2>
        {contest.winner ? <p>Selected entry: <strong className="font-mono">{contest.winner.entryRef}</strong></p> : <p className="muted">No winner selected yet.</p>}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="mb-2 text-xl font-bold">Audit log</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="muted"><th className="p-1">When</th><th className="p-1">Admin</th><th className="p-1">Action</th><th className="p-1">Change</th></tr></thead>
          <tbody>
            {(data?.audit ?? []).map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="p-1">{a.createdAtText}</td><td className="p-1 font-mono">{a.admin_id.slice(0, 8)}</td><td className="p-1">{a.action}</td>
                <td className="p-1 font-mono">{a.prior_value !== null && a.prior_value !== undefined ? `${JSON.stringify(a.prior_value)} → ` : ""}{a.new_value !== null && a.new_value !== undefined ? JSON.stringify(a.new_value) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SettingsTab({ contest, reload }: { contest: Contest; reload: () => Promise<void> }) {
  const [f, setF] = useState({ title: contest.title, instructions: contest.instructions, timezone: contest.timezone, opensAtLocal: contest.opensAtLocal, closesAtLocal: contest.closesAtLocal });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="card flex max-w-2xl flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try { await api("/api/admin/contest", "PATCH", f); await reload(); setMsg({ ok: true, text: "Saved." }); }
        catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed." }); }
      }}
    >
      <div><label className="label" htmlFor="title">Contest title</label><input id="title" className="input" value={f.title} onChange={set("title")} /></div>
      <div><label className="label" htmlFor="ins">Instructions</label><textarea id="ins" rows={6} className="input" value={f.instructions} onChange={set("instructions")} /></div>
      <div><label className="label" htmlFor="tz">Timezone (IANA name)</label><input id="tz" className="input" value={f.timezone} onChange={set("timezone")} placeholder="Asia/Kolkata" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="op">Opens (in contest timezone)</label><input id="op" type="datetime-local" className="input" value={f.opensAtLocal} onChange={set("opensAtLocal")} /></div>
        <div><label className="label" htmlFor="cl">Closes (in contest timezone)</label><input id="cl" type="datetime-local" className="input" value={f.closesAtLocal} onChange={set("closesAtLocal")} /></div>
      </div>
      <p className="muted text-sm">Currently: opens {contest.opensAtText}; closes {contest.closesAtText}; last permissible start {contest.lastStartText}. Times are stored in UTC.</p>
      {msg && <p className={msg.ok ? "text-[var(--ok)]" : "err"} role="status">{msg.text}</p>}
      <button className="btn btn-primary self-start">Save settings</button>
    </form>
  );
}

function EntriesTab({ contest, reload }: { contest: Contest; reload: () => Promise<void> }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page) });
    if (status) p.set("status", status);
    if (kind) p.set("kind", kind);
    if (query) p.set("q", query);
    try {
      const d = await api<{ entries: Entry[]; total: number }>(`/api/admin/entries?${p}`);
      setEntries(d.entries); setTotal(d.total); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load."); }
  }, [page, status, kind, query]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / 24));

  return (
    <div className="flex flex-col gap-4">
      <form className="card flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
        <div><label className="label" htmlFor="q">Search name or employee ID</label><input id="q" className="input" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label className="label" htmlFor="st">Status</label>
          <select id="st" className="input" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All</option>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className="label" htmlFor="kd">Type</label>
          <select id="kd" className="input" value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }}>
            <option value="">Official + test</option><option value="official">Official</option><option value="test">Test</option>
          </select></div>
        <button className="btn">Search</button>
      </form>
      {error && <p className="err" role="alert">{error}</p>}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {entries.map((en) => (
          <li key={en.id} className="card flex flex-col gap-2 !p-3">
            <button onClick={() => setOpen(en)} className="block overflow-hidden rounded-md bg-white" aria-label={`Open entry ${en.entryRef}`}>
              {en.hasDrawing ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/entries/${en.id}/preview`} alt={`Drawing for entry ${en.entryRef}`} className="aspect-square w-full object-contain" loading="lazy" />
              ) : <div className="grid aspect-square place-items-center text-sm text-gray-500">No drawing</div>}
            </button>
            <div className="font-mono font-bold">{en.entryRef} {en.isWinner && "🏆"}</div>
            <div className="flex flex-wrap gap-1 text-xs">
              <span className={`banner ${en.isTest ? "banner-test" : "banner-info"} !px-2 !py-0.5`}>{en.isTest ? "Test" : "Official"}</span>
              <span className="banner banner-info !px-2 !py-0.5">{STATE_LABEL[en.state]}</span>
            </div>
            <div className="muted text-xs">{en.completedAtText ?? "Not completed"}</div>
          </li>
        ))}
      </ul>
      {!entries.length && !error && <p className="muted">No entries match.</p>}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages} · {total} entries</span>
        <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
      {open && <EntryDialog entry={open} winnerId={contest.winner?.attemptId} onClose={() => setOpen(null)} onChanged={async () => { await reload(); await load(); }} />}
    </div>
  );
}

function EntryDialog({ entry, winnerId, onClose, onChanged }: { entry: Entry; winnerId?: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [identity, setIdentity] = useState<{ name: string; employeeId: string } | null>(null);
  const [msg, setMsg] = useState("");
  const eligible = !entry.isTest && entry.hasDrawing && (entry.state === "submitted" || entry.state === "expired");
  return (
    <div role="dialog" aria-modal="true" aria-label={`Entry ${entry.entryRef}`} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-3">
      <div className="card flex max-h-full w-full max-w-4xl flex-col gap-3 overflow-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xl font-bold">{entry.entryRef} {entry.isTest ? "(test)" : "(official)"}</h2>
          <button className="btn" onClick={onClose} autoFocus>Close</button>
        </div>
        {entry.hasDrawing && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/admin/entries/${entry.id}/preview`} alt={`Full drawing for entry ${entry.entryRef}`} className="w-full rounded-md bg-white" />
        )}
        <div className="flex flex-wrap items-center gap-3">
          {identity ? (
            <p>Identity: <strong>{identity.name}</strong> · <span className="font-mono">{identity.employeeId}</span></p>
          ) : (
            <button className="btn" onClick={async () => { try { const d = await api<{ identity: { name: string; employeeId: string } }>(`/api/admin/entries/${entry.id}?reveal=1`); setIdentity(d.identity); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); } }}>
              Reveal identity (audited)
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!eligible || winnerId === entry.id}
            onClick={async () => { try { await api("/api/admin/winner", "POST", { attemptId: entry.id }); setMsg("Winner selected."); await onChanged(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); } }}
          >
            {winnerId === entry.id ? "Current winner 🏆" : "Select as winner"}
          </button>
        </div>
        {!eligible && <p className="muted text-sm">Only finalized, non-empty official submissions can be selected as winner.</p>}
        {msg && <p role="status">{msg}</p>}
      </div>
    </div>
  );
}
