"use client";

import { useCallback, useEffect, useState } from "react";
import { ID_PREFIX } from "@/lib/constants";
import { validateName, validateSuffix } from "@/lib/validation";
import DrawingSession, { clearRecoveryCopies } from "./DrawingSession";
import HalloweenFx from "./HalloweenFx";

type Attempt =
  | { kind: "in_progress"; deadlineAt: string; isTest: boolean }
  | { kind: "locked_elsewhere"; message: string }
  | { kind: "used_elsewhere"; message: string }
  | {
      kind: "finalized";
      entryRef: string;
      state: string;
      completionMethod: string | null;
      completedAtText: string;
      isTest: boolean;
    };

type Status =
  | { authenticated: false }
  | {
      authenticated: true;
      participant: { name: string; employeeId: string };
      contest: { title: string; instructions: string; testing: boolean; opensAtText: string | null; lastStartText: string | null; closesAtText: string | null };
      attempt: Attempt | null;
      canStart: boolean;
      startBlockMessage: string | null;
    };

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function PortalApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not load the portal.");
      setStatus(body);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the portal. Check your connection.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  const logout = async () => {
    clearRecoveryCopies();
    await post("/api/logout", {}).catch(() => {});
    setStatus({ authenticated: false });
  };

  if (loadError)
    return (
      <div className="card">
        <p className="err" role="alert">{loadError}</p>
        <button className="btn mt-3" onClick={() => void load()}>Retry</button>
      </div>
    );
  if (!status) return <p className="muted" role="status">Loading…</p>;
  if (!status.authenticated) return <Login onDone={load} />;

  const drawing = status.attempt?.kind === "in_progress";
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div>
          <h1 className="spooky-title text-2xl font-bold sm:text-3xl">🎃 {status.contest.title}</h1>
          <p className="muted text-sm">
            {status.participant.name} · {status.participant.employeeId}
          </p>
          </div>
        </div>
        {!drawing && (
          <button className="btn" onClick={() => void logout()}>
            Sign out
          </button>
        )}
      </header>
      {drawing ? (
        <DrawingSession onFinished={() => void load()} />
      ) : status.attempt?.kind === "finalized" ? (
        <Confirmation status={status} />
      ) : (
        <Rules status={status} onStarted={load} />
      )}
    </div>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [errors, setErrors] = useState<{ name?: string; suffix?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = validateName(name);
    const s = validateSuffix(suffix);
    const next = { name: n.ok ? undefined : n.message, suffix: s.ok ? undefined : s.message };
    setErrors(next);
    if (!n.ok || !s.ok) return;
    setBusy(true);
    try {
      const res = await post("/api/login", { name: n.value, suffix: s.value });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message ?? "Could not sign in.";
        setErrors(body?.field ? { [body.field]: msg } : { form: msg });
        return;
      }
      await onDone();
    } catch {
      setErrors({ form: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div className="login-bg" aria-hidden="true" style={{ backgroundImage: "url(/bg.jpg)" }} />
    <div className="relative z-10 mx-auto mt-2 w-full max-w-md sm:mt-8">
    <div className="login-critters" aria-hidden="true">
      <span>🦇</span><span>🎃</span><span>👻</span><span>🕸️</span><span>🦇</span>
    </div>
    <form onSubmit={submit} noValidate className="login-card flex w-full flex-col gap-4">
      <h1 className="login-title spooky-title text-center">Halloween Drawing Contest</h1>
      <p className="text-center text-sm text-[#f3d9ff]">Draw something spooky. You get 15 minutes. 🕯️</p>
      <div>
        <label htmlFor="name" className="label">Employee name</label>
        <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby="name-err" />
        <p id="name-err" className="err" role="alert">{errors.name}</p>
      </div>
      <div>
        <label htmlFor="suffix" className="label">Employee ID</label>
        <div className="flex flex-nowrap items-stretch">
          <span className="grid shrink-0 place-items-center whitespace-nowrap rounded-l-lg border border-r-0 border-[var(--accent)] bg-[rgba(255,117,24,0.18)] px-3 font-mono font-bold text-[#ffd2a8]" aria-hidden="true">
            {ID_PREFIX}
          </span>
          <input
            id="suffix"
            className="input min-w-0 flex-1 !rounded-l-none font-mono"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0042"
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            aria-invalid={!!errors.suffix}
            aria-describedby="suffix-err suffix-help"
          />
        </div>
        <p id="suffix-help" className="muted text-sm">Enter only the 4 digits, e.g. {ID_PREFIX}0042.</p>
        <p id="suffix-err" className="err" role="alert">{errors.suffix}</p>
      </div>
      {errors.form && <p className="banner banner-bad" role="alert">{errors.form}</p>}
      <button className="btn btn-primary login-btn" disabled={busy}>{busy ? "Please wait…" : "Enter the contest 🎃"}</button>
    </form>
    </div>
    </>
  );
}

function Rules({ status, onStarted }: { status: Extract<Status, { authenticated: true }>; onStarted: () => Promise<void> }) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { contest, attempt } = status;

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await post("/api/attempt/start", { acknowledged: true });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message ?? "Could not start.");
        await onStarted();
        return;
      }
      await onStarted();
    } catch {
      setError("Starting requires an internet connection. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div className="rules-bg" aria-hidden="true" style={{ backgroundImage: "url(/drawing.jpg)" }} />
    <div className="relative z-10 grid gap-4 md:grid-cols-[2fr_1fr]">
      <section className="card">
        <h2 className="mb-3 text-xl font-bold">Rules &amp; instructions</h2>
        <div className="whitespace-pre-line">{contest.instructions}</div>
        <ul className="muted mt-4 list-disc space-y-1 pl-5 text-sm">
          <li>You have exactly 15 minutes from the moment you press Start Drawing.</li>
          <li>Tools: brush, eraser, colours, brush size, undo, redo and clear. No uploads, pasting or stickers.</li>
          <li>The timer cannot be paused. Refreshing or closing the page does not extend it.</li>
          <li>Work is autosaved; only work the server has saved is kept when time runs out.</li>
          <li>Submitting is final.</li>
        </ul>
      </section>
      <section className="card flex flex-col gap-3">
        <h2 className="text-xl font-bold">Your attempt</h2>
        {contest.opensAtText && <p className="muted text-sm">Opens: {contest.opensAtText}</p>}
        {contest.lastStartText && <p className="muted text-sm">Last start time: {contest.lastStartText}</p>}
        {attempt && "message" in attempt ? (
          <p className="banner banner-info" role="status">{attempt.message}</p>
        ) : status.canStart ? (
          <p className="banner banner-info" role="status">No attempt used yet. Logging in does not start the timer.</p>
        ) : null}
        {!status.canStart && status.startBlockMessage && <p className="banner banner-warn" role="status">{status.startBlockMessage}</p>}
        {status.canStart && (
          <>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I have read the rules and understand the 15-minute timer starts now and cannot be paused.</span>
            </label>
            <button className="btn btn-primary" disabled={!ack || busy} onClick={() => void start()}>
              {busy ? "Starting…" : "Start Drawing"}
            </button>
          </>
        )}
        {error && <p className="err" role="alert">{error}</p>}
      </section>
    </div>
    </>
  );
}

function Confirmation({ status }: { status: Extract<Status, { authenticated: true }> }) {
  const a = status.attempt as Extract<Attempt, { kind: "finalized" }>;
  const empty = a.state === "expired_empty";
  return (
    <>
      <HalloweenFx />
      <section className="thanks relative z-10 mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center" aria-live="polite">
        <div className="thanks-icons" aria-hidden="true">
          <span>🦇</span>
          <span className="thanks-pumpkin">🎃</span>
          <span>👻</span>
        </div>
        <h2 className="login-title spooky-title">{empty ? "Time is up!" : "Thank you for participating!"}</h2>
        <p className="thanks-sub">{empty ? "Your canvas was empty when the clock ran out, so there is no entry to judge." : "We will announce the winner soon."}</p>
        <p className="thanks-foot" aria-hidden="true">💀 🕸️ 🕯️ 🕷️ 🦴</p>
      </section>
    </>
  );
}
