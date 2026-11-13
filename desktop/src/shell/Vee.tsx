// Vee, Creavia's mascot (brand/mascot.svg), big and alive: it bobs, blinks, and its spark spins while something works.
// Flat colours only. prefers-reduced-motion keeps it still.
export function Vee({ size = 120, mood = "idle", className = "" }: { size?: number; mood?: "idle" | "working" | "happy" | "sleepy"; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" className={`vee-big vee mood-${mood} ${className}`} aria-hidden>
      <ellipse className="vee-shadow" cx="128" cy="236" rx="62" ry="9" fill="#000" opacity=".45" />
      <g className="vee-body">
        <path d="M128 72v-18" stroke="var(--vee-shade)" strokeWidth="8" strokeLinecap="round" />
        <path className="vee-spark" d="M128 22q4 14 18 18q-14 4-18 18q-4-14-18-18q14-4 18-18z" fill="var(--vee-spark)" />
        <path d="M128 70c54 0 84 36 84 82c0 40-32 66-84 66s-84-26-84-66c0-46 30-82 84-82z" fill="var(--vee-shade)" />
        <path d="M124 70c50 0 78 32 78 74c0 34-28 56-76 56s-74-22-74-56c0-42 26-74 72-74z" fill="var(--vee-body)" />
        {mood === "sleepy" ? (
          <g stroke="#141412" strokeWidth="5" strokeLinecap="round" fill="none"><path d="M95 142q10 6 20 0" /><path d="M141 142q10 6 20 0" /></g>
        ) : mood === "happy" ? (
          <g stroke="#141412" strokeWidth="6" strokeLinecap="round" fill="none"><path d="M95 144q10-12 20 0" /><path d="M141 144q10-12 20 0" /></g>
        ) : (
          <g className="vee-eyes">
            <ellipse cx="105" cy="140" rx="10" ry="14" fill="#141412" />
            <ellipse cx="151" cy="140" rx="10" ry="14" fill="#141412" />
            <circle cx="108.5" cy="134" r="3.6" fill="#fff" />
            <circle cx="154.5" cy="134" r="3.6" fill="#fff" />
          </g>
        )}
        <ellipse cx="86" cy="164" rx="12" ry="7" fill="var(--vee-blush)" />
        <ellipse cx="170" cy="164" rx="12" ry="7" fill="var(--vee-blush)" />
        {mood === "happy" ? <path d="M116 160q12 14 24 0z" fill="#141412" /> : <path d="M120 162q8 8 16 0" stroke="#141412" strokeWidth="5" strokeLinecap="round" fill="none" />}
      </g>
    </svg>
  );
}
