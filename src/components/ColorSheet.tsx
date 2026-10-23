"use client";

import { useRef, useState } from "react";

export const BASIC_COLORS = [
  "#ec7f7b", "#ee3224", "#7b4141", "#8e4040", "#3b0606", "#8ef2f0", "#60f3ee", "#3585ee", "#0b1de8", "#0a1a9a", "#164283", "#0b0b84",
  "#f7f27c", "#f9f23e", "#ff7518", "#ef8b52", "#7a4a14", "#8b8a2a", "#8086ee", "#8b2eee", "#2f86c4", "#06083f", "#5a1a6e", "#32063f",
  "#92f58c", "#8ff23c", "#62ee4f", "#7ff27c", "#6af29a", "#85813b", "#f08cc1", "#ee8af0", "#ee2ae6", "#ee2a80", "#8184b8", "#7a0f45",
  "#2f7a14", "#2e8348", "#2e8486", "#4f8383", "#0b3d12", "#0f3d3a", "#7d1a7d", "#3d0f7d", "#000000", "#7f7f7f", "#bfbfbf", "#ffffff",
];

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
  const [R, G, B] = [r / 255, g / 255, b / 255];
  let h = 0;
  if (d) h = mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx];
}
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
const parse = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Bottom sheet modelled on MS Paint's "Edit colors": basic colours, custom slots, spectrum, hex and RGB. */
export default function ColorSheet({
  color,
  custom,
  onPick,
  onSaveCustom,
  onClose,
}: {
  color: string;
  custom: string[];
  onPick: (hex: string) => void;
  onSaveCustom: (hex: string) => void;
  onClose: () => void;
}) {
  const [hsv, setHsv] = useState(() => rgbToHsv(...parse(color)));
  const [hexText, setHexText] = useState(color);
  const squareRef = useRef<HTMLDivElement>(null);
  const [r, g, b] = hsvToRgb(...hsv);
  const hex = toHex(r, g, b);

  const apply = (next: [number, number, number]) => {
    setHsv(next);
    setHexText(toHex(...hsvToRgb(...next)));
  };
  const fromSquare = (e: React.PointerEvent) => {
    const box = squareRef.current!.getBoundingClientRect();
    apply([hsv[0], clamp((e.clientX - box.left) / box.width, 0, 1), 1 - clamp((e.clientY - box.top) / box.height, 0, 1)]);
  };
  const setChannel = (i: 0 | 1 | 2, v: number) => {
    const rgb: [number, number, number] = [r, g, b];
    rgb[i] = clamp(Math.round(v) || 0, 0, 255);
    apply(rgbToHsv(...rgb));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label="Colours">
      <div className="color-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Colours</h2>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-2 text-sm font-semibold">Basic colours</div>
        <div className="color-grid">
          {BASIC_COLORS.map((c) => (
            <button key={c} className="swatch" style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={c === color} onClick={() => onPick(c)} />
          ))}
        </div>

        <div className="mt-3 text-sm font-semibold">Custom colours</div>
        <div className="color-grid">
          {Array.from({ length: 8 }, (_, i) => custom[i]).map((c, i) =>
            c ? (
              <button key={i} className="swatch" style={{ background: c }} aria-label={`Custom colour ${c}`} aria-pressed={c === color} onClick={() => onPick(c)} />
            ) : (
              <span key={i} className="swatch swatch-empty" aria-hidden="true" />
            ),
          )}
        </div>

        <div className="mt-3 text-sm font-semibold">Mix a colour</div>
        <div className="flex gap-3">
          <div
            ref={squareRef}
            className="sv-square"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv[0]}, 100%, 50%))` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              fromSquare(e);
            }}
            onPointerMove={(e) => e.buttons && fromSquare(e)}
          >
            <span className="sv-knob" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }} />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-12 rounded-lg border border-[var(--border)]" style={{ background: hex }} aria-label={`Selected ${hex}`} />
            <input
              className="input"
              aria-label="Hex colour"
              value={hexText}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                setHexText(v);
                if (/^#[0-9a-fA-F]{6}$/.test(v)) setHsv(rgbToHsv(...parse(v.toLowerCase())));
              }}
            />
            <div className="flex gap-2">
              {(["R", "G", "B"] as const).map((n, i) => (
                <input key={n} className="input" aria-label={n} inputMode="numeric" value={[r, g, b][i]} onChange={(e) => setChannel(i as 0 | 1 | 2, Number(e.target.value))} />
              ))}
            </div>
          </div>
        </div>
        <input
          type="range"
          className="hue-slider"
          aria-label="Hue"
          min={0}
          max={359}
          value={Math.round(hsv[0])}
          onChange={(e) => apply([Number(e.target.value), hsv[1] || 1, hsv[2] || 1])}
        />

        <div className="mt-3 flex gap-3">
          <button className="btn flex-1" onClick={() => onSaveCustom(hex)}>
            + Add to custom
          </button>
          <button className="btn btn-primary flex-1" onClick={() => onPick(hex)}>
            Use colour
          </button>
        </div>
      </div>
    </div>
  );
}
