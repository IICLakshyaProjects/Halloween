/** Ambient Halloween effects (lightning, bats, ghosts, fog, cobwebs). Decorative only; hidden from assistive tech. */
const bats = [
  { top: "8%", size: "1.6rem", delay: "0s", dur: "17s" },
  { top: "22%", size: "1.1rem", delay: "-6s", dur: "21s" },
  { top: "38%", size: "1.9rem", delay: "-11s", dur: "25s" },
  { top: "14%", size: "1.3rem", delay: "-15s", dur: "19s" },
];

function Web({ className }: { className: string }) {
  return (
    <svg className={`fx-web ${className}`} viewBox="0 0 160 160" fill="none" stroke="currentColor" strokeWidth="1">
      {[0, 18, 36, 54, 72, 90].map((a) => (
        <line key={a} x1="0" y1="0" x2={160 * Math.cos((a * Math.PI) / 180)} y2={160 * Math.sin((a * Math.PI) / 180)} />
      ))}
      {[28, 52, 78, 106, 136].map((r) => (
        <path key={r} d={`M${r} 0 Q${r * 0.74} ${r * 0.74} 0 ${r}`} />
      ))}
    </svg>
  );
}

export default function HalloweenFx({ floatingSymbol = "👻" }: { floatingSymbol?: string } = {}) {
  return (
    <div className="fx-root" aria-hidden="true">
      <div className="fx-fog fx-fog-a" />
      <div className="fx-fog fx-fog-b" />
      <Web className="fx-web-tl" />
      <Web className="fx-web-tr" />
      <div className="fx-spider">
        <span className="fx-thread" />
        <span>🕷️</span>
      </div>
      {bats.map((b, i) => (
        <span key={i} className="fx-bat" style={{ top: b.top, fontSize: b.size, animationDelay: b.delay, animationDuration: b.dur }}>
          🦇
        </span>
      ))}
      <span className="fx-ghost fx-ghost-a">{floatingSymbol}</span>
      <span className="fx-ghost fx-ghost-b">{floatingSymbol}</span>
      <svg className="fx-bolt fx-bolt-a" viewBox="0 0 100 160">
        <path d="M62 0 L28 78 L52 78 L34 160 L84 62 L58 62 L78 0Z" />
      </svg>
      <svg className="fx-bolt fx-bolt-b" viewBox="0 0 100 160">
        <path d="M62 0 L28 78 L52 78 L34 160 L84 62 L58 62 L78 0Z" />
      </svg>
      <div className="fx-flash" />
    </div>
  );
}
