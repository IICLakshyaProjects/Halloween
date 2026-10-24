"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { ID_PREFIX } from "@/lib/constants";
import { validateName, validateSuffix } from "@/lib/validation";
import { clearRecoveryCopies } from "@/lib/drawing-recovery";
import HalloweenFx from "./HalloweenFx";
import LobbyAudio from "./LobbyAudio";

const DrawingSession = dynamic(() => import("./DrawingSession"), {
  loading: () => <p className="muted" role="status">Opening your drawing workspace…</p>,
});

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
      contest: { title: string; instructions: string; opensAtText: string | null; lastStartText: string | null; closesAtText: string | null };
      attempt: Attempt | null;
      canStart: boolean;
      startBlockMessage: string | null;
    };

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function PortalApp() {
  // Each page visit starts at sign-in; keep the server session for safe drawing recovery.
  const [status, setStatus] = useState<Status>({ authenticated: false });
  const [loadError, setLoadError] = useState("");
  const [loginFlash, setLoginFlash] = useState(false);
  const [contestStarted, setContestStarted] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

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

  const logout = async () => {
    clearRecoveryCopies();
    await post("/api/logout", {}).catch(() => {});
    setStatus({ authenticated: false });
    setContestStarted(false);
    setJustSubmitted(false);
  };

  if (loadError)
    return (
      <div className="card">
        <p className="err" role="alert">{loadError}</p>
        <button className="btn mt-3" onClick={() => void load()}>Retry</button>
      </div>
    );
  const drawing = status.authenticated && status.attempt?.kind === "in_progress" && contestStarted;
  // Returning participants can start again when permitted; finishing a drawing still shows only its receipt.
  const showConfirmation = status.authenticated && status.attempt?.kind === "finalized" && (!status.canStart || justSubmitted);
  const lobbyEffects = <>
    <LobbyAudio active={!contestStarted && !drawing && !showConfirmation} />
    {loginFlash && <div className="login-success-storm" aria-hidden="true" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setLoginFlash(false); }}>
      <svg className="login-corner-left" viewBox="0 0 100 160"><path d="M62 0 28 78H52L34 160 84 62H58L78 0Z" /></svg>
      <svg className="login-corner-right" viewBox="0 0 100 160"><path d="M62 0 28 78H52L34 160 84 62H58L78 0Z" /></svg>
    </div>}
  </>;
  if (!status.authenticated) return <>{lobbyEffects}<Login onDone={async () => {
    await load();
    setLoginFlash(true);
    // Warm the editor during the rules screen, without adding it to the initial sign-in bundle.
    void import("./DrawingSession").catch(() => {});
  }} /></>;

  return (
    <>
    {lobbyEffects}
    <div className={`flex flex-col gap-4 ${loginFlash && !drawing ? "portal-arrival" : ""}`}>
      <header className={`flex flex-wrap items-center justify-between gap-2 ${showConfirmation ? "relative z-10" : ""}`}>
        <div className="flex items-center gap-3">
          <div>
          <h1 className="spooky-title text-2xl font-bold sm:text-3xl">{!showConfirmation && <span aria-hidden="true">🎃 </span>}{status.contest.title}</h1>
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
        <DrawingSession onFinished={() => { setJustSubmitted(true); void load(); }} />
      ) : showConfirmation ? (
        <Confirmation status={status} />
      ) : (
        <Rules status={status} onStarted={load} onStartAccepted={() => setContestStarted(true)} />
      )}
    </div>
    </>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [errors, setErrors] = useState<{ name?: string; suffix?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setImpact((value) => value + 1);
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
    <div className={`login-scene ${impact ? "login-scene-impact" : ""}`}>
    {impact > 0 && <div key={impact} className="login-impact" aria-hidden="true" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setImpact(0); }} />}
    <div className="login-bg" aria-hidden="true" style={{ backgroundImage: "url(/bg.jpg)" }} />
    <div className="entry-atmosphere" aria-hidden="true">
      <HalloweenFx floatingSymbol="🎃" />
      <span className="login-edge-shadow login-edge-shadow-left" />
      <span className="login-edge-shadow login-edge-shadow-right" />
      {(["left", "right"] as const).map((side) => <svg key={side} className={`haunted-border-bolt haunted-border-${side}`} viewBox="0 0 100 700" preserveAspectRatio="none" fill="none">
        <path d="M15 0 40 80 18 145 59 200 28 280 62 350 23 440 48 520 20 605 42 700" />
        <path d="m40 80 30 26-5 40M59 200l30 44-12 47M23 440l52 23 10 40M20 605l47 25" />
      </svg>)}
      <span className="login-edge-splash login-edge-splash-left" />
      <span className="login-edge-splash login-edge-splash-right" />
    </div>
    <div className="entry-login relative z-10 mx-auto w-full max-w-md">
    <div className="login-critters" aria-hidden="true">
      <span>🦇</span><span>🎃</span><span>🕸️</span><span>🦇</span>
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
            onChange={(e) => {
              const value = e.target.value;
              setSuffix(value);
              setErrors((previous) => ({ ...previous, suffix: /[^0-9]/.test(value) ? "Digits only (0–9)." : value.length > 4 ? "Enter exactly 4 digits." : undefined }));
            }}
            aria-invalid={!!errors.suffix}
            aria-describedby="suffix-err"
          />
        </div>
        <p id="suffix-err" className="err" role="alert">{errors.suffix}</p>
      </div>
      {errors.form && <p className="banner banner-bad" role="alert">{errors.form}</p>}
      <button className="btn btn-primary login-btn" disabled={busy}>{busy ? "Please wait…" : "Enter the contest"}</button>
    </form>
    </div>
    </div>
  );
}

function Rules({ status, onStarted, onStartAccepted }: { status: Extract<Status, { authenticated: true }>; onStarted: () => Promise<void>; onStartAccepted: () => void }) {
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
      onStartAccepted();
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
    <div className="entry-atmosphere" aria-hidden="true"><HalloweenFx /></div>
    <div className="rules-reveal relative z-10 grid gap-4 md:grid-cols-[2fr_1fr]">
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
        {attempt?.kind === "in_progress" && <p className="banner banner-info" role="status">Your drawing is still in progress. Its original timer is running.</p>}
        {contest.opensAtText && <p className="muted text-sm">Opens: {contest.opensAtText}</p>}
        {contest.lastStartText && <p className="muted text-sm">Last start time: {contest.lastStartText}</p>}
        {attempt && "message" in attempt && !status.canStart ? (
          <p className="banner banner-info" role="status">{attempt.message}</p>
        ) : status.canStart ? (
          <p className="banner banner-info" role="status">Ready to draw. Logging in does not start the timer.</p>
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
        {attempt?.kind === "in_progress" && <button className="btn btn-primary" onClick={onStartAccepted}>Resume drawing</button>}
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
    <div className="submission-scene">
      <div className="submission-backdrop" aria-hidden="true" />
      <div className="submission-atmosphere" aria-hidden="true"><HalloweenFx /></div>
      <section className="submission-receipt" aria-live="polite">
        <svg className="submission-bat" viewBox="0 0 160 85" aria-hidden="true"><path d="M80 33 74 23 70 35Q47 13 10 10L27 37Q45 30 48 53 64 41 80 70 96 41 112 53 115 30 133 37L150 10Q113 13 90 35L86 23Z" /></svg>
        <div className="submission-emblem" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{empty ? <path d="M20 10v13m0 7h.01" /> : <path d="m10 21 7 7 14-16" />}</svg>
        </div>
        <h2 className="submission-title">{empty ? "Time is up!" : "Drawing submitted!"}</h2>
        <p className="submission-message">{empty ? "Your canvas was empty when time ran out, so no drawing was submitted." : "Thank you for participating. The winner will be announced soon."}</p>
        {a.completedAtText && <p className="submission-time">{a.completedAtText}</p>}
      </section>
    </div>
  );
}
