"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  fitDims,
  MAX_BRUSH,
  MAX_OPS_PER_REQUEST,
  MAX_STROKE_POINTS,
  MIN_BRUSH,
  type DrawOp,
  type Stroke,
} from "@/lib/constants";
import { floodRuns } from "@/lib/fill";
import { BRUSH_STYLES, paintShapes, previewSvg, sampleSvg, strokeShapes, type StyleId } from "@/lib/brushes";
import { MAX_TEXT_LENGTH, MAX_TEXT_LINES, SHAPES, paintShape, paintText, shapeIconPath, shapeSvg, textSvg, type ShapeId } from "@/lib/shapes";
import ColorSheet from "./ColorSheet";
import LobbyAudio from "./LobbyAudio";
import { recoveryKey } from "@/lib/drawing-recovery";

type Tool = "pencil" | "brush" | "eraser" | "fill" | "picker" | "zoom" | "text" | "select" | "shape";
type ShapeMode = "outline" | "both" | "fill";
const QUICK_COLORS = ["#111111", "#ffffff", "#ff7518", "#7c3aed", "#16a34a", "#dc2626", "#facc15", "#2563eb", "#92400e", "#ec4899", "#14b8a6", "#6b7280"];
const DEFAULT_SIZES: Record<"pencil" | "brush" | "eraser" | "shape" | "text", number> = { pencil: 3, brush: 14, eraser: 28, shape: 4, text: 14 };
const fontPx = (size: number) => Math.min(144, Math.max(12, size * 3));

function Icon({ d }: { d: string[] }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}
const ICONS = {
  pencil: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  brush: ["m18.4 2.6-4.4 4.4-1.6-1.6a2 2 0 0 0-2.8 0L8 7l9 9 1.6-1.6a2 2 0 0 0 0-2.8L17 10l4.4-4.4a2.1 2.1 0 1 0-3-3z", "M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"],
  eraser: ["m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21", "M22 21H7", "m5 11 9 9"],
  fill: ["m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11z", "m5 2 5 5", "M2 13h15", "M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4z"],
  picker: ["m2 22 1-1h3l9-9", "M3 21v-3l9-9", "m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z"],
  zoom: ["m21 21-4.3-4.3", "M11 8v6", "M8 11h6", "M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z"],
  text: ["M4 7V4h16v3", "M9 20h6", "M12 4v16"],
  select: ["M4 8V6a2 2 0 0 1 2-2h2", "M16 4h2a2 2 0 0 1 2 2v2", "M20 16v2a2 2 0 0 1-2 2h-2", "M8 20H6a2 2 0 0 1-2-2v-2", "M12 4h.01", "M12 20h.01", "M4 12h.01", "M20 12h.01"],
  shapes: ["m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"],
  clock: ["M12 6v6l4 2", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
  down: ["m6 9 6 6 6-6"],
  up: ["m18 15-6-6-6 6"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
};

type SaveState = "saving" | "saved" | "offline" | "failed";
type Mode = "loading" | "editing" | "readonly" | "locked";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.tool === "fill") {
    // One path so adjacent spans never leave hairline seams at fractional scales.
    const r = s.runs ?? [];
    ctx.fillStyle = s.color;
    ctx.beginPath();
    for (let i = 0; i + 2 < r.length; i += 3) ctx.rect(r[i + 1], r[i], r[i + 2] - r[i + 1] + 1, 1);
    ctx.fill();
    return;
  }
  if (s.tool === "shape") return paintShape(ctx, s);
  if (s.tool === "text") return paintText(ctx, s);
  if (s.tool === "move") {
    // Copy the selected pixels (as they are at this point in the drawing) and paste them offset; a move also blanks the source.
    const k = ctx.getTransform().a;
    const [x, y, w, h] = s.rect ?? [0, 0, 0, 0];
    const sx = Math.round(x * k), sy = Math.round(y * k), sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    tmp.getContext("2d")!.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!s.copy) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx, sy, sw, sh);
    }
    ctx.drawImage(tmp, Math.round((x + (s.dx ?? 0)) * k), Math.round((y + (s.dy ?? 0)) * k));
    ctx.restore();
    return;
  }
  paintShapes(ctx, strokeShapes(s), s.tool === "eraser" ? "#ffffff" : s.color);
}

function applyOps(strokes: Stroke[], ops: DrawOp[]) {
  let out = strokes;
  for (const op of ops) {
    if (op.t === "add") out = out.some((s) => s.id === op.stroke.id) ? out : [...out, op.stroke];
    else if (op.t === "undo") out = out.filter((s) => s.id !== op.id);
    else out = [];
  }
  return out;
}

const newId = () => crypto.randomUUID();

export default function DrawingSession({ onFinished }: { onFinished: () => void }) {
  const dims = useRef({ w: 900, h: 1600 });
  const [canvasKey, setCanvasKey] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  const freeCanvasSize = () => {
    const area = areaRef.current;
    if (!area) return {};
    const cs = getComputedStyle(area);
    const d = fitDims(
      area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
    );
    return { width: d.w, height: d.h };
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorId = useRef(newId());
  const attemptId = useRef("");

  const strokes = useRef<Stroke[]>([]);
  const redo = useRef<Stroke[]>([]);
  const pending = useRef<DrawOp[]>([]);
  const serverRev = useRef(0);
  const inflight = useRef(false);
  const current = useRef<Stroke | null>(null);
  const lastBeat = useRef(0);
  const anchor = useRef({ serverMs: 0, perf: 0, deadlineMs: 0 });
  const modeRef = useRef<Mode>("loading");
  const finishing = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  // Ref data is mirrored into state only for what the render needs (button enablement).
  const [counts, setCounts] = useState({ strokes: 0, redo: 0, pen: false });
  const bump = () =>
    setCounts({ strokes: strokes.current.length, redo: redo.current.length, pen: strokes.current.some((s) => s.tool === "pen" || s.tool === "shape" || s.tool === "text") });
  const [mode, setModeState] = useState<Mode>("loading");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [remaining, setRemaining] = useState(900_000);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#ff7518");
  const [brushStyle, setBrushStyle] = useState<StyleId>("brush");
  const [brushMenu, setBrushMenu] = useState(false);
  const [custom, setCustom] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hw_custom_colors") ?? "[]");
      return Array.isArray(saved) ? saved.filter((c) => typeof c === "string" && /^#[0-9a-f]{6}$/.test(c)).slice(0, 8) : [];
    } catch {
      return [];
    }
  });
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [colorOpen, setColorOpen] = useState(false);
  const [barOpen, setBarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= window.innerHeight * 1.1);
  const barRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const view = useRef({ z: 1, x: 0, y: 0 });
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mx: number; my: number; moved: number; pinch: boolean } | null>(null);
  const resizeRef = useRef<() => void>(() => {});
  const [color2, setColor2] = useState("#ffffff");
  const [target, setTarget] = useState<1 | 2>(1);
  const [shapeId, setShapeId] = useState<ShapeId>("oval");
  const [shapeMode, setShapeMode] = useState<ShapeMode>("outline");
  const [shapeMenu, setShapeMenu] = useState(false);
  const [textAt, setTextAt] = useState<[number, number] | null>(null);
  const [textValue, setTextValue] = useState("");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [hasSel, setHasSel] = useState(false);
  const [copyMode, setCopyModeState] = useState(false);
  const setCopyMode = (v: boolean) => {
    copyRef.current = v;
    setCopyModeState(v);
  };
  const selRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const selNew = useRef<{ x0: number; y0: number } | null>(null);
  const selDrag = useRef<{ x0: number; y0: number; dx: number; dy: number } | null>(null);
  const cur = target === 1 ? color : color2;
  const setCur = (c: string) => (target === 1 ? setColor(c) : setColor2(c));
  const sized = tool === "pencil" || tool === "brush" || tool === "eraser" || tool === "shape" || tool === "text";
  const size = sized ? sizes[tool] : 0;
  const sizePct = Math.round(((size - MIN_BRUSH) / (MAX_BRUSH - MIN_BRUSH)) * 100);
  const shapeFill = shapeMode === "fill" ? color : shapeMode === "both" ? color2 : null;
  const penStyle: StyleId = tool === "pencil" ? "pencil" : brushStyle;
  const newStroke = (points: [number, number][]): Stroke =>
    tool === "eraser"
      ? { id: newId(), tool: "eraser", color, size, points }
      : { id: newId(), tool: "pen", style: penStyle, color, size, points };
  const [message, setMessage] = useState<{ kind: "info" | "bad"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<null | "submit" | "clear">(null);
  const [submitting, setSubmitting] = useState(false);
  const submitToneRef = useRef<HTMLAudioElement>(null);
  const [, setWarning] = useState("");
  const warned = useRef({ five: false, one: false });

  const setMode = useCallback((m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);

  const saveCustom = (hex: string) => {
    const next = [hex, ...custom.filter((c) => c !== hex)].slice(0, 8);
    setCustom(next);
    try {
      localStorage.setItem("hw_custom_colors", JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    const bar = barRef.current;
    const body = bodyRef.current;
    if (!bar || !body) return;
    const measure = () => body.style.setProperty("--bar-h", `${bar.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Re-fit the canvas right after the toolbar opens or closes.
    const id = requestAnimationFrame(() => resizeRef.current());
    return () => cancelAnimationFrame(id);
  }, [barOpen, canvasKey]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ------------------------------------------------------------ canvas painting
  // Committed strokes live in a cached bitmap; only the stroke being drawn is repainted per frame.
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const baseDirty = useRef(true);
  const setDims = (c: { width: number; height: number } | null | undefined) => {
    if (c && (c.width !== dims.current.w || c.height !== dims.current.h)) {
      dims.current = { w: c.width, h: c.height };
      baseDirty.current = true;
      setCanvasKey((k) => k + 1);
    }
  };
  const copyRef = useRef(false);
  const frame = useRef(0);
  const paintBase = (st: Stroke, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const k = canvas.width / dims.current.w;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    paintStroke(ctx, st);
  };
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const base = (baseRef.current ??= document.createElement("canvas"));
    if (base.width !== canvas.width || base.height !== canvas.height) {
      base.width = canvas.width;
      base.height = canvas.height;
      baseDirty.current = true;
    }
    if (baseDirty.current) {
      const b = base.getContext("2d")!;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.fillStyle = "#fff";
      b.fillRect(0, 0, base.width, base.height);
      for (const st of strokes.current) paintBase(st, base);
      baseDirty.current = false;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    if (current.current) {
      ctx.setTransform(canvas.width / dims.current.w, 0, 0, canvas.width / dims.current.w, 0, 0);
      paintStroke(ctx, current.current);
    }
    const sel = selRef.current;
    if (sel && sel.w > 0 && sel.h > 0) {
      const k = canvas.width / dims.current.w;
      const d = selDrag.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (d && (d.dx || d.dy)) {
        // Live preview of the move/copy before it is committed.
        const sx = Math.round(sel.x * k), sy = Math.round(sel.y * k), sw = Math.max(1, Math.round(sel.w * k)), sh = Math.max(1, Math.round(sel.h * k));
        if (!copyRef.current) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(sx, sy, sw, sh);
        }
        ctx.drawImage(base, sx, sy, sw, sh, Math.round((sel.x + d.dx) * k), Math.round((sel.y + d.dy) * k), sw, sh);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#7c3aed";
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(Math.round((sel.x + (d?.dx ?? 0)) * k) + 1, Math.round((sel.y + (d?.dy ?? 0)) * k) + 1, Math.round(sel.w * k) - 2, Math.round(sel.h * k) - 2);
      ctx.setLineDash([]);
    }
  }, []);
  const redrawSoon = () => {
    if (!frame.current) frame.current = requestAnimationFrame(() => ((frame.current = 0), redraw()));
  };

  // Zoom/pan: the canvas wrapper is scaled with a CSS transform (origin top-left) and clamped to stay inside the drawing area.
  const applyView = useCallback(() => {
    const area = areaRef.current;
    const wrap = wrapRef.current;
    if (!area || !wrap) return;
    const A = area.getBoundingClientRect();
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    const L = A.left + (A.width - w) / 2;
    const T = A.top + (A.height - h) / 2;
    const v = view.current;
    const sw = w * v.z;
    const sh = h * v.z;
    v.x = sw >= A.width ? Math.min(A.left - L, Math.max(A.right - sw - L, v.x)) : A.left + (A.width - sw) / 2 - L;
    v.y = sh >= A.height ? Math.min(A.top - T, Math.max(A.bottom - sh - T, v.y)) : A.top + (A.height - sh) / 2 - T;
    wrap.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    setZoomPct(Math.round(v.z * 100));
  }, []);

  const setView = (nz: number, fx: number, fy: number, dx = 0, dy = 0) => {
    const area = areaRef.current;
    const wrap = wrapRef.current;
    if (!area || !wrap) return;
    const v = view.current;
    const r = wrap.getBoundingClientRect();
    const z = Math.min(6, Math.max(1, nz));
    const u = (fx - r.left) / v.z;
    const t = (fy - r.top) / v.z;
    v.x += fx - u * z + dx - r.left;
    v.y += fy - t * z + dy - r.top;
    v.z = z;
    applyView();
  };
  const zoomBy = (factor: number) => {
    const A = areaRef.current!.getBoundingClientRect();
    setView(view.current.z * factor, A.left + A.width / 2, A.top + A.height / 2);
    resizeRef.current();
  };
  const zoomFit = () => {
    view.current = { z: 1, x: 0, y: 0 };
    applyView();
    resizeRef.current();
  };

  useEffect(() => {
    const area = areaRef.current;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!area || !wrap || !canvas) return;
    // Largest 2:3 canvas that fits the free space, so the drawing area is as big as the screen allows.
    const resize = () => {
      const cs = getComputedStyle(area);
      const freeW = area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const freeH = area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const w = Math.max(1, Math.floor(Math.min(freeW, (freeH * dims.current.w) / dims.current.h)));
      const h = Math.round((w * dims.current.h) / dims.current.w);
      wrap.style.width = `${w}px`;
      wrap.style.height = `${h}px`;
      // Zoomed in? Render the backing bitmap sharper (capped) so strokes stay crisp.
      const dpr = Math.min(window.devicePixelRatio || 1, 3) * Math.max(1, Math.ceil(view.current.z));
      canvas.width = Math.max(1, Math.round(w * Math.max(1, Math.min(dpr, 2400 / w))));
      canvas.height = Math.round((canvas.width * dims.current.h) / dims.current.w);
      baseDirty.current = true;
      applyView();
      redraw();
    };
    resizeRef.current = resize;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(area);
    return () => ro.disconnect();
  }, [redraw, applyView]);

  // ------------------------------------------------------------ persistence + sync
  const persistLocal = () => {
    try {
      if (attemptId.current) localStorage.setItem(recoveryKey(attemptId.current), JSON.stringify(pending.current));
    } catch {}
  };

  const syncClock = (serverNow: string) => {
    anchor.current.serverMs = Date.parse(serverNow);
    anchor.current.perf = performance.now();
  };

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setMode("locked");
    try {
      localStorage.removeItem(recoveryKey(attemptId.current));
    } catch {}
    // Ask the server for the final state (it finalizes lazily if the scheduler has not run yet).
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch("/api/attempt", { cache: "no-store" });
        const body = await res.json();
        if (res.ok && body.attempt.state !== "in_progress") break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    onFinished();
  }, [onFinished, setMode]);

  const handleSaveError = useCallback(
    (status: number, code: string, text: string) => {
      if (code === "expired" || code === "finalized") {
        setMessage({ kind: "bad", text });
        void finish();
      } else if (code === "not_editor") {
        setMode("readonly");
        setMessage({ kind: "bad", text });
      } else {
        setSaveState("failed");
        setMessage({ kind: "bad", text: status === 429 ? "Saving is paused briefly. Retrying…" : text });
      }
    },
    [finish, setMode],
  );

  const flush = useCallback(async () => {
    if (inflight.current || modeRef.current !== "editing" || finishing.current) return;
    const ops = pending.current.slice(0, MAX_OPS_PER_REQUEST);
    if (!ops.length && Date.now() - lastBeat.current < 8000) return;
    inflight.current = true;
    if (ops.length) setSaveState("saving");
    try {
      const res = await fetch("/api/attempt/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId: editorId.current, ops }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.error?.code === "out_of_sync" && Number.isInteger(body?.revision)) {
          const revision = body.revision as number;
          serverRev.current = revision;
          pending.current = pending.current.map((op, index) => ({ ...op, seq: revision + index + 1 }));
          persistLocal();
          setTimeout(() => void flushRef.current(), 0);
          return;
        }
        handleSaveError(res.status, body?.error?.code ?? "", body?.error?.message ?? "Save failed.");
        return;
      }
      lastBeat.current = Date.now();
      serverRev.current = body.revision;
      pending.current = pending.current.filter((o) => o.seq > body.revision);
      persistLocal();
      syncClock(body.serverNow);
      setSaveState(pending.current.length ? "saving" : "saved");
      setMessage(null);
      if (pending.current.length) setTimeout(() => void flushRef.current(), 50);
    } catch {
      setSaveState(navigator.onLine ? "failed" : "offline");
    } finally {
      inflight.current = false;
    }
  }, [handleSaveError]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const queue = (op: Omit<DrawOp, "seq"> & Record<string, unknown>) => {
    const seq = serverRev.current + pending.current.length + 1;
    pending.current.push({ ...op, seq } as DrawOp);
    persistLocal();
    setSaveState("saving");
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void flushRef.current(), 400);
  };

  // ------------------------------------------------------------ boot: load authoritative state, claim editor lease
  const claim = useCallback(async () => {
    try {
      const res = await fetch("/api/attempt/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId: editorId.current, ...freeCanvasSize() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setDims(body.canvas);
        syncClock(body.serverNow);
        lastBeat.current = Date.now();
        setMode("editing");
        setMessage(null);
        return true;
      }
      if (body?.error?.code === "editor_busy") {
        setMode("readonly");
        setMessage({ kind: "bad", text: body.error.message });
      } else if (body?.error?.code === "finalized") {
        void finish();
      }
    } catch {
      setMessage({ kind: "bad", text: "Offline — reconnect to continue." });
    }
    return false;
  }, [finish, setMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/attempt", { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error?.message ?? "Could not load your drawing.");
        if (body.attempt.state !== "in_progress") {
          void finish();
          return;
        }
        attemptId.current = body.attempt.id;
        serverRev.current = body.attempt.revision;
        setDims(body.canvas);
        strokes.current = body.strokes as Stroke[];
        anchor.current.deadlineMs = Date.parse(body.attempt.deadlineAt);
        syncClock(body.serverNow);

        // Local recovery copy (scoped to this attempt id, which only the owning session can load).
        try {
          const raw = localStorage.getItem(recoveryKey(body.attempt.id));
          const saved: DrawOp[] = raw ? JSON.parse(raw) : [];
          const fresh = saved.filter((o) => o.seq > serverRev.current);
          if (fresh.every((o, i) => o.seq === serverRev.current + 1 + i)) {
            pending.current = fresh;
            strokes.current = applyOps(strokes.current, fresh);
          }
        } catch {}
        baseDirty.current = true;
        redraw();
        bump();
        await claim();
      } catch (e) {
        if (!cancelled) setMessage({ kind: "bad", text: e instanceof Error ? e.message : "Could not load your drawing." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claim, finish, redraw]);

  // ------------------------------------------------------------ timer, autosave interval, readonly polling
  useEffect(() => {
    const id = setInterval(() => {
      const a = anchor.current;
      if (!a.deadlineMs) return;
      const left = a.deadlineMs - (a.serverMs + (performance.now() - a.perf));
      setRemaining(left);
      if (left <= 0 && modeRef.current !== "locked" && modeRef.current !== "loading") {
        setConfirm(null);
        void finish();
      }
      if (left <= 300_000 && left > 60_000 && !warned.current.five) {
        warned.current.five = true;
        setWarning("5 minutes remaining.");
      }
      if (left <= 60_000 && left > 0 && !warned.current.one) {
        warned.current.one = true;
        setWarning("Only 1 minute remaining!");
      }
    }, 250);
    const save = setInterval(() => void flush(), 3000);
    const poll = setInterval(() => {
      if (modeRef.current === "readonly") void claim();
    }, 10_000);
    const online = () => void flush();
    window.addEventListener("online", online);
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(id);
      clearInterval(save);
      clearInterval(poll);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", warn);
    };
  }, [claim, finish, flush]);

  // ------------------------------------------------------------ drawing input
  const toLogical = (e: React.PointerEvent | PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) * dims.current.w) / r.width;
    const y = ((e.clientY - r.top) * dims.current.h) / r.height;
    return [Math.min(dims.current.w, Math.max(0, Math.round(x * 10) / 10)), Math.min(dims.current.h, Math.max(0, Math.round(y * 10) / 10))];
  };

  const commitCurrent = () => {
    const s = current.current;
    current.current = null;
    if (!s) return;
    strokes.current = [...strokes.current, s];
    redo.current = [];
    if (!baseDirty.current && baseRef.current) paintBase(s, baseRef.current);
    queue({ t: "add", stroke: s });
    bump();
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || modeRef.current === "loading") return;
    e.preventDefault();
    setBrushMenu(false);
    setShapeMenu(false);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ptrs.current.size >= 2) {
      // Two fingers: pinch-zoom / pan. Abandon any stroke the first finger started.
      current.current = null;
      selNew.current = null;
      selDrag.current = null;
      redraw();
      const [a, b] = [...ptrs.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, moved: 99, pinch: true };
      return;
    }
    if (tool === "zoom") {
      gesture.current = { dist: 0, mx: e.clientX, my: e.clientY, moved: 0, pinch: false };
      return;
    }
    if (modeRef.current !== "editing") return;
    const p = toLogical(e);
    if (tool === "fill") return bucketFill(p);
    if (tool === "picker") return pickColor(p);
    if (tool === "text") {
      setTextAt(p);
      return;
    }
    if (tool === "select") {
      const sel = selRef.current;
      if (sel && p[0] >= sel.x && p[0] <= sel.x + sel.w && p[1] >= sel.y && p[1] <= sel.y + sel.h) selDrag.current = { x0: p[0], y0: p[1], dx: 0, dy: 0 };
      else {
        selNew.current = { x0: p[0], y0: p[1] };
        selRef.current = { x: Math.round(p[0]), y: Math.round(p[1]), w: 0, h: 0 };
        setHasSel(false);
      }
      redraw();
      return;
    }
    if (tool === "shape") {
      current.current = {
        id: newId(), tool: "shape", shape: shapeId, color: shapeMode === "fill" ? color : color, size, points: [],
        box: [p[0], p[1], p[0], p[1]], fillColor: shapeFill, outline: shapeMode !== "fill",
      };
      redraw();
      return;
    }
    current.current = newStroke([p]);
    redraw();
  };

  const pickColor = ([lx, ly]: [number, number]) => {
    const canvas = canvasRef.current!;
    redraw();
    const k = canvas.width / dims.current.w;
    const d = canvas.getContext("2d")!.getImageData(Math.min(canvas.width - 1, Math.floor(lx * k)), Math.min(canvas.height - 1, Math.floor(ly * k)), 1, 1).data;
    (target === 1 ? setColor : setColor2)("#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join(""));
    setTool("brush");
  };

  const bucketFill = ([lx, ly]: [number, number]) => {
    const sx = Math.min(dims.current.w - 1, Math.floor(lx));
    const sy = Math.min(dims.current.h - 1, Math.floor(ly));
    // Rasterise the saved strokes at logical resolution, then record the filled spans as a vector-safe operation.
    const off = document.createElement("canvas");
    off.width = dims.current.w;
    off.height = dims.current.h;
    const ctx = off.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, dims.current.w, dims.current.h);
    for (const s of strokes.current) paintStroke(ctx, s);
    const px = ctx.getImageData(0, 0, dims.current.w, dims.current.h);
    const at = (sy * dims.current.w + sx) * 4;
    const hex = parseInt(color.slice(1), 16);
    if (Math.abs(px.data[at] - (hex >> 16)) + Math.abs(px.data[at + 1] - ((hex >> 8) & 255)) + Math.abs(px.data[at + 2] - (hex & 255)) < 12) return;
    const runs = floodRuns(px.data, dims.current.w, dims.current.h, sx, sy);
    if (!runs) {
      setMessage({ kind: "info", text: "That area is too detailed to fill." });
      return;
    }
    const stroke: Stroke = { id: newId(), tool: "fill", color, size: 1, points: [], runs };
    strokes.current = [...strokes.current, stroke];
    redo.current = [];
    if (!baseDirty.current && baseRef.current) paintBase(stroke, baseRef.current);
    queue({ t: "add", stroke });
    redraw();
    bump();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g?.pinch && ptrs.current.size >= 2) {
      e.preventDefault();
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      setView(view.current.z * (dist / g.dist), mx, my, mx - g.mx, my - g.my);
      Object.assign(g, { dist, mx, my });
      return;
    }
    if (g && tool === "zoom" && !g.pinch) {
      e.preventDefault();
      g.moved += Math.abs(e.clientX - g.mx) + Math.abs(e.clientY - g.my);
      setView(view.current.z, e.clientX, e.clientY, e.clientX - g.mx, e.clientY - g.my);
      g.mx = e.clientX;
      g.my = e.clientY;
      return;
    }
    if (tool === "select" && (selNew.current || selDrag.current)) {
      e.preventDefault();
      const p = toLogical(e);
      if (selDrag.current) {
        selDrag.current.dx = Math.round(p[0] - selDrag.current.x0);
        selDrag.current.dy = Math.round(p[1] - selDrag.current.y0);
      } else if (selNew.current) {
        const { x0, y0 } = selNew.current;
        selRef.current = { x: Math.round(Math.min(x0, p[0])), y: Math.round(Math.min(y0, p[1])), w: Math.round(Math.abs(p[0] - x0)), h: Math.round(Math.abs(p[1] - y0)) };
      }
      redrawSoon();
      return;
    }
    const s = current.current;
    if (!s) return;
    e.preventDefault();
    if (s.tool === "shape" && s.box) {
      const p = toLogical(e);
      s.box = [s.box[0], s.box[1], p[0], p[1]];
      redrawSoon();
      return;
    }
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toLogical(ev);
      const last = s.points[s.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.5) continue;
      s.points.push(p);
      if (s.points.length >= MAX_STROKE_POINTS) {
        const carry = s.points[s.points.length - 1];
        commitCurrent();
        current.current = newStroke([carry]);
        redraw();
        return;
      }
    }
    redrawSoon();
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ptrs.current.delete(e.pointerId);
    const g = gesture.current;
    if (g) {
      if (!ptrs.current.size) {
        gesture.current = null;
        if (g.pinch) resizeRef.current();
        else if (g.moved < 8) {
          // Magnifier tap: zoom in at the tapped point, wrapping back to fit after the maximum.
          if (view.current.z >= 3.9) zoomFit();
          else {
            setView(view.current.z * 2, e.clientX, e.clientY);
            resizeRef.current();
          }
        }
      }
      return;
    }
    if (tool === "select" && (selNew.current || selDrag.current)) {
      const d = selDrag.current;
      const sel = selRef.current;
      selNew.current = null;
      selDrag.current = null;
      if (d && sel && (d.dx || d.dy)) {
        const st: Stroke = { id: newId(), tool: "move", color: "#000000", size: 1, points: [], rect: [sel.x, sel.y, sel.w, sel.h], dx: d.dx, dy: d.dy, copy: copyMode };
        selRef.current = { ...sel, x: sel.x + d.dx, y: sel.y + d.dy };
        commitCurrentStroke(st);
      } else if (!sel || sel.w < 4 || sel.h < 4) selRef.current = null;
      setHasSel(!!selRef.current);
      redraw();
      return;
    }
    if (!current.current) return;
    e.preventDefault();
    const c = current.current;
    if (c.tool === "shape" && c.box && Math.hypot(c.box[2] - c.box[0], c.box[3] - c.box[1]) < 4) {
      current.current = null;
      redraw();
      return;
    }
    commitCurrent();
    redraw();
  };

  const commitCurrentStroke = (st: Stroke) => {
    strokes.current = [...strokes.current, st];
    redo.current = [];
    if (!baseDirty.current && baseRef.current) paintBase(st, baseRef.current);
    queue({ t: "add", stroke: st });
    bump();
  };

  const addText = () => {
    const at = textAt;
    const text = textValue.split("\n").slice(0, MAX_TEXT_LINES).join("\n").slice(0, MAX_TEXT_LENGTH);
    setTextAt(null);
    setTextValue("");
    if (!at || !text.trim()) return;
    commitCurrentStroke({ id: newId(), tool: "text", color, size: fontPx(sizes.text), points: [at], text, bold, italic });
    redraw();
  };

  const selectAll = () => {
    selRef.current = { x: 0, y: 0, w: dims.current.w, h: dims.current.h };
    setHasSel(true);
    redraw();
  };
  const clearSel = () => {
    selRef.current = null;
    setHasSel(false);
    redraw();
  };
  const deleteSel = () => {
    const sel = selRef.current;
    if (!sel) return;
    commitCurrentStroke({ id: newId(), tool: "shape", shape: "rect", color: "#ffffff", size: 1, points: [], box: [sel.x, sel.y, sel.x + sel.w, sel.y + sel.h], fillColor: "#ffffff", outline: false });
    redraw();
  };

  // ------------------------------------------------------------ editing commands
  const editing = mode === "editing";

  const undo = () => {
    const s = strokes.current[strokes.current.length - 1];
    if (!s || !editing) return;
    strokes.current = strokes.current.slice(0, -1);
    redo.current = [...redo.current, s];
    queue({ t: "undo", id: s.id });
    baseDirty.current = true;
    redraw();
    bump();
  };

  const redoStroke = () => {
    const s = redo.current[redo.current.length - 1];
    if (!s || !editing) return;
    redo.current = redo.current.slice(0, -1);
    strokes.current = [...strokes.current, s];
    queue({ t: "add", stroke: s });
    baseDirty.current = true;
    redraw();
    bump();
  };

  const clearCanvas = () => {
    setConfirm(null);
    if (!editing || !strokes.current.length) return;
    strokes.current = [];
    redo.current = [];
    queue({ t: "clear" });
    baseDirty.current = true;
    redraw();
    bump();
  };

  const openSubmitConfirmation = () => {
    const submitTone = submitToneRef.current;
    if (submitTone) {
      submitTone.currentTime = 0;
      void submitTone.play().catch(() => {
        // Opening the confirmation still works if the browser declines audio playback.
      });
    }
    setConfirm("submit");
  };

  const submit = async () => {
    if (!editing || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      // Drain any backlog beyond one request's worth, then submit the remainder atomically.
      let guard = 0;
      while (pending.current.length > MAX_OPS_PER_REQUEST && guard++ < 20) {
        inflight.current = false;
        await flush();
      }
      const res = await fetch("/api/attempt/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId: editorId.current, ops: pending.current.slice(0, MAX_OPS_PER_REQUEST) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        pending.current = [];
        void finish();
        return;
      }
      setConfirm(null);
      const code = body?.error?.code;
      if (code === "empty") setMessage({ kind: "bad", text: body.error.message });
      else if (code === "expired" || code === "finalized") void finish();
      else setMessage({ kind: "bad", text: body?.error?.message ?? "Submission failed. Please try again." });
    } catch {
      setConfirm(null);
      setMessage({ kind: "bad", text: "We could not confirm your submission — your connection may be interrupted. Press Submit again; retrying is safe." });
    } finally {
      setSubmitting(false);
    }
  };


  const low = remaining <= 60_000;
  const timeNote = remaining <= 0 ? "" : remaining <= 60_000 ? "1 min left!" : remaining <= 300_000 ? "5 min left" : "";
  const toolBtns: { id: Tool; label: string; icon: string[] }[] = [
    { id: "pencil", label: "Pencil", icon: ICONS.pencil },
    { id: "brush", label: "Brush", icon: ICONS.brush },
    { id: "eraser", label: "Eraser", icon: ICONS.eraser },
    { id: "fill", label: "Fill", icon: ICONS.fill },
    { id: "picker", label: "Pick", icon: ICONS.picker },
    { id: "text", label: "Text", icon: ICONS.text },
    { id: "select", label: "Select", icon: ICONS.select },
    { id: "shape", label: "Shapes", icon: ICONS.shapes },
    { id: "zoom", label: "Zoom", icon: ICONS.zoom },
  ];
  const previewHtml =
    tool === "shape"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 38">${shapeSvg({ id: "p", tool: "shape", shape: shapeId, color, size: Math.min(size, 8), points: [], box: [14, 5, 86, 33], fillColor: shapeFill, outline: shapeMode !== "fill" })}</svg>`
      : tool === "text"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 38">${textSvg({ id: "p", tool: "text", color, size: Math.min(30, fontPx(size) / 2), points: [[12, 3]], text: "Aa", bold, italic })}</svg>`
        : previewSvg(penStyle, color, size || 6, tool === "eraser");
  const quick = QUICK_COLORS.includes(cur) ? QUICK_COLORS : [cur, ...QUICK_COLORS];

  return (
    <div
      className="draw-screen"
      onPaste={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
    >
      <LobbyAudio active={(mode === "editing" || mode === "readonly") && confirm !== "submit"} src="/drawing.mp3" />
      <audio ref={submitToneRef} src="/sound one.mp3" preload="auto" hidden />
      {/* Top bar: timer, undo/redo, submit — always visible, never over the canvas */}
      <div className="draw-edge" aria-hidden="true" />
      <span className="draw-bat" aria-hidden="true">🦇</span>
      <header className="draw-top">
        <div className="flex items-center gap-2">
          <div className={`timer-chip ${low ? "timer-low" : ""}`}>
            <div className="flex items-center gap-1">
              <Icon d={ICONS.clock} />
              <div role="timer" aria-label={`Time remaining ${fmt(remaining)}`} className="font-mono text-2xl font-bold leading-none">
                {fmt(remaining)}
              </div>
            </div>
            {timeNote && (
              <span role="status" aria-live="assertive" className="timer-note">
                {timeNote}
              </span>
            )}
          </div>
          <button className="icon-btn" aria-label="Undo" disabled={!editing || !counts.strokes} onClick={undo}>
            <Icon d={ICONS.undo} />
          </button>
          <button className="icon-btn" aria-label="Redo" disabled={!editing || !counts.redo} onClick={redoStroke}>
            <Icon d={ICONS.redo} />
          </button>
          <button className="btn btn-primary" disabled={!editing || submitting || !counts.pen} onClick={openSubmitConfirmation}>
            Submit
          </button>
        </div>
      </header>

      {(message || mode === "locked" || saveState === "offline" || saveState === "failed") && (
        <div className="draw-strip" role="status" aria-live="assertive">
          {mode === "locked" && <span className="banner banner-info">Time is up — finalizing…</span>}
          {(saveState === "offline" || saveState === "failed") && <span className="banner banner-bad">{saveState === "offline" ? "Offline — will sync when you reconnect" : "Save failed — retrying"}</span>}
          {message && (
            <span className={`banner ${message.kind === "bad" ? "banner-bad" : "banner-info"}`}>
              {message.text}
              {mode === "readonly" && (
                <button className="ml-2 underline" onClick={() => void claim()}>
                  Retry
                </button>
              )}
            </span>
          )}
        </div>
      )}

      <div ref={bodyRef} className={`draw-body ${barOpen ? "bar-open" : ""}`}>
        {/* The canvas gets every pixel the toolbar does not need */}
        <div ref={areaRef} className="draw-area">
          <div ref={wrapRef} className="canvas-wrap" aria-label="Drawing canvas" role="img">
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
              style={{ cursor: editing ? "crosshair" : "not-allowed" }}
            />
          </div>
        </div>

        {/* Compact MS Paint-style toolbar: tools, sizes, colour swatches */}
        <div ref={barRef} className={`draw-bar ${barOpen ? "" : "collapsed"}`} role="toolbar" aria-label="Drawing tools">
          <div className="bar-bats" aria-hidden="true">
            <span className="bat bat1">🦇</span>
            <span className="bat bat2">🦇</span>
            <span className="bat bat3">🦇</span>
          </div>
          {brushMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBrushMenu(false)} />
              <div className="brush-menu" role="listbox" aria-label="Brush type">
                {BRUSH_STYLES.map((b) => (
                  <button
                    key={b.id}
                    role="option"
                    aria-selected={brushStyle === b.id}
                    className="brush-row"
                    onClick={() => {
                      setBrushStyle(b.id);
                      setBrushMenu(false);
                    }}
                  >
                    <span>{b.label}</span>
                    <span className="brush-sample" dangerouslySetInnerHTML={{ __html: sampleSvg(b.id, "#111111") }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {shapeMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShapeMenu(false)} />
              <div className="brush-menu shape-menu" role="listbox" aria-label="Shapes">
                <div className="shape-grid">
                  {SHAPES.map((sh) => (
                    <button key={sh.id} role="option" aria-selected={shapeId === sh.id} aria-label={sh.label} className="shape-btn" onClick={() => { setShapeId(sh.id); setShapeMenu(false); }}>
                      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                        <path d={shapeIconPath(sh.id)} />
                      </svg>
                    </button>
                  ))}
                </div>
                <div className="shape-modes">
                  {(["outline", "both", "fill"] as const).map((m) => (
                    <button key={m} className="mode-btn" aria-pressed={shapeMode === m} onClick={() => setShapeMode(m)}>
                      {m === "outline" ? "Outline" : m === "both" ? "Outline + fill" : "Fill"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="bar-tools">
            {toolBtns.map((t) => (
              <button
                key={t.id}
                className="tool-btn"
                aria-label={t.label}
                title={t.label}
                aria-pressed={tool === t.id}
                aria-haspopup={t.id === "brush" || t.id === "shape" ? "listbox" : undefined}
                disabled={!editing && t.id !== "zoom"}
                onClick={() => {
                  setBrushMenu(t.id === "brush" ? (tool === "brush" ? !brushMenu : true) : false);
                  setShapeMenu(t.id === "shape" ? (tool === "shape" ? !shapeMenu : true) : false);
                  if (t.id !== "select" && selRef.current) {
                    selRef.current = null;
                    setHasSel(false);
                    redraw();
                  }
                  setTool(t.id);
                }}
              >
                <Icon d={t.icon} />
                <span className="tool-label">{t.label}</span>
                {(t.id === "brush" || t.id === "shape") && <span className="caret" aria-hidden="true" />}
              </button>
            ))}
            <button className="tool-btn tool-clear" aria-label="Clear canvas" title="Clear" disabled={!editing || !counts.strokes} onClick={() => setConfirm("clear")}>
              <Icon d={ICONS.trash} />
              <span className="tool-label">Clear</span>
            </button>
          </div>

          {tool === "zoom" ? (
            <div className="bar-sizes" role="group" aria-label="Zoom">
              <button className="size-btn zoom-btn" aria-label="Zoom out" onClick={() => zoomBy(0.5)}>−</button>
              <span className="zoom-pct">{zoomPct}%</span>
              <button className="size-btn zoom-btn" aria-label="Zoom in" onClick={() => zoomBy(2)}>+</button>
              <button className="size-btn zoom-fit" onClick={zoomFit}>Fit</button>
              <span className="muted text-xs">Pinch or tap the canvas</span>
            </div>
          ) : tool === "select" ? (
            <div className="bar-sizes" role="group" aria-label="Selection">
              <button className="mode-btn" aria-pressed={!copyMode} onClick={() => setCopyMode(false)}>Move</button>
              <button className="mode-btn" aria-pressed={copyMode} onClick={() => setCopyMode(true)}>Copy</button>
              <button className="mode-btn" disabled={!hasSel} onClick={deleteSel}>Delete</button>
              <button className="mode-btn" onClick={selectAll}>All</button>
              <button className="mode-btn" disabled={!hasSel} onClick={clearSel}>✕</button>
            </div>
          ) : (
            <div className="bar-sizes" role="group" aria-label="Size">
              <span className="size-preview" aria-hidden="true" style={{ opacity: sized ? 1 : 0.3 }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
              <input
                type="range"
                className="size-slider"
                aria-label="Line thickness"
                aria-valuetext={`${sizePct}%`}
                min={0}
                max={100}
                step={1}
                value={sized ? sizePct : 0}
                disabled={!editing || !sized}
                onChange={(e) => sized && setSizes((z) => ({ ...z, [tool]: Math.round(MIN_BRUSH + (Number(e.target.value) / 100) * (MAX_BRUSH - MIN_BRUSH)) }))}
              />
              <span className="size-pct">{sized ? sizePct : 0}%</span>
            </div>
          )}

          <div className="bar-colors" role="group" aria-label="Colours">
            <button className="color-chip" aria-label="Colour 1" aria-pressed={target === 1} onClick={() => setTarget(1)}>
              <span style={{ background: color }} />
            </button>
            <button className="color-chip" aria-label="Colour 2" aria-pressed={target === 2} onClick={() => setTarget(2)}>
              <span style={{ background: color2 }} />
            </button>
            <button className="more-colors" aria-label="More colours" disabled={!editing} onClick={() => { setBrushMenu(false); setShapeMenu(false); setColorOpen(true); }} />
            {quick.map((c) => (
              <button
                key={c}
                className="swatch swatch-sm"
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={cur === c}
                disabled={!editing}
                onClick={() => {
                  setCur(c);
                  if (tool === "eraser" || tool === "picker" || tool === "zoom") setTool("brush");
                }}
              />
            ))}
          </div>
        </div>
        <button
          className={`bar-tab ${barOpen ? "open" : ""}`}
          aria-label={barOpen ? "Hide tools" : "Show tools"}
          aria-expanded={barOpen}
          onClick={() => {
            setBrushMenu(false);
            setShapeMenu(false);
            setBarOpen((o) => !o);
          }}
        >
          <Icon d={ICONS.up} />
        </button>
      </div>

      {textAt && (
        <div role="dialog" aria-modal="true" aria-label="Add text" className="fixed inset-0 z-50 grid place-items-end bg-black/60 sm:place-items-center" onClick={() => setTextAt(null)}>
          <div className="color-sheet text-sheet" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              className="text-input"
              rows={3}
              maxLength={MAX_TEXT_LENGTH}
              value={textValue}
              placeholder="Type here"
              onChange={(e) => setTextValue(e.target.value)}
              style={{ color, fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal", fontSize: Math.min(40, Math.max(16, fontPx(sizes.text) / 2)) }}
            />
            <div className="mt-2 flex items-center gap-2">
              <button className="mode-btn" aria-pressed={bold} onClick={() => setBold((b) => !b)}><b>B</b></button>
              <button className="mode-btn" aria-pressed={italic} onClick={() => setItalic((i) => !i)}><i>I</i></button>
              <input type="range" className="size-slider" aria-label="Text size" min={MIN_BRUSH} max={MAX_BRUSH} value={sizes.text} onChange={(e) => setSizes((z) => ({ ...z, text: Number(e.target.value) }))} />
            </div>
            <div className="mt-3 flex gap-3">
              <button className="btn flex-1" onClick={() => { setTextAt(null); setTextValue(""); }}>Cancel</button>
              <button className="btn btn-primary flex-1" disabled={!textValue.trim()} onClick={addText}>Add text</button>
            </div>
          </div>
        </div>
      )}

      {colorOpen && (
        <ColorSheet
          color={cur}
          custom={custom}
          onPick={(c) => {
            setCur(c);
            if (tool === "eraser" || tool === "picker" || tool === "zoom") setTool("brush");
            setColorOpen(false);
          }}
          onSaveCustom={saveCustom}
          onClose={() => setColorOpen(false)}
        />
      )}

      {confirm && (
        <div role="alertdialog" aria-modal="true" aria-label="Confirm" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className={confirm === "submit" ? "card submit-challenge-modal" : "card max-w-sm"}>
            {confirm === "submit" ? (
              <>
                <LobbyAudio active src="/3.mp3" />
                <Image className="submission-ending-image" src="/istockphoto-607771622-1024x1024.jpg" alt="" aria-hidden="true" width={400} height={215} unoptimized />
                <svg className="blood-drips" aria-hidden="true" viewBox="0 0 400 245" preserveAspectRatio="none" style={{ display: "none" }}>
                  <path fill="#7e1018" d="M0 0h400v30c-12 8-29 7-43 0v52c0 17-15 17-15 0V29c-15 8-32 9-48 2v107c0 20-18 20-18 0V30c-19 8-41 8-59 0v51c0 16-15 16-15 0V29c-18 8-35 8-55 1v152c0 23-20 23-20 0V30c-16 8-34 8-51 1v86c0 18-16 18-16 0V29c-15 7-30 7-46 0v55c0 17-14 17-14 0V29c-17 8-32 7-43 1Z">
                    <animate attributeName="d" dur="3.2s" repeatCount="indefinite" values="M0 0h400v30c-12 8-29 7-43 0v52c0 17-15 17-15 0V29c-15 8-32 9-48 2v107c0 20-18 20-18 0V30c-19 8-41 8-59 0v51c0 16-15 16-15 0V29c-18 8-35 8-55 1v152c0 23-20 23-20 0V30c-16 8-34 8-51 1v86c0 18-16 18-16 0V29c-15 7-30 7-46 0v55c0 17-14 17-14 0V29c-17 8-32 7-43 1Z;M0 0h400v27c-12 5-29 5-43 0v77c0 20-15 20-15 0V28c-15 5-32 6-48 1v72c0 18-18 18-18 0V28c-19 5-41 5-59 0v79c0 19-15 19-15 0V28c-18 5-35 5-55 0v119c0 21-20 21-20 0V28c-16 5-34 5-51 0v109c0 20-16 20-16 0V28c-15 5-30 5-46 0v77c0 19-14 19-14 0V28c-17 5-32 5-43 0Z;M0 0h400v30c-12 8-29 7-43 0v52c0 17-15 17-15 0V29c-15 8-32 9-48 2v107c0 20-18 20-18 0V30c-19 8-41 8-59 0v51c0 16-15 16-15 0V29c-18 8-35 8-55 1v152c0 23-20 23-20 0V30c-16 8-34 8-51 1v86c0 18-16 18-16 0V29c-15 7-30 7-46 0v55c0 17-14 17-14 0V29c-17 8-32 7-43 1Z" />
                  </path>
                  <path fill="#b3212a" opacity=".66" d="M0 0h400v10c-53 8-96-3-145 3-69 9-116-4-160 2C-351 20-379 14-400 9V0Z" />
                  <circle fill="#9f1620" cx="238" cy="210" r="3"><animate attributeName="cy" values="184;239" dur="1.8s" repeatCount="indefinite" /></circle>
                  <circle fill="#a71923" cx="320" cy="175" r="2"><animate attributeName="cy" values="155;238" dur="2.4s" repeatCount="indefinite" /></circle>
                </svg>
                <h2 className="mb-2 text-xl font-bold">The seal is waiting.</h2>
                <p className="submit-challenge-quote mb-4">Once it is sealed, there is no turning back.</p>
                <div className="submit-actions flex gap-3">
                  <button className="btn btn-primary flex-1" disabled={submitting} onClick={() => void submit()} autoFocus>
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                  <button className="btn flex-1" disabled={submitting} onClick={() => setConfirm(null)}>
                    Keep drawing
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-xl font-bold">Clear the canvas?</h2>
                <p className="muted mb-4">The timer keeps running.</p>
                <div className="flex gap-3">
                  <button className="btn btn-danger flex-1" onClick={clearCanvas} autoFocus>
                    Clear
                  </button>
                  <button className="btn flex-1" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
