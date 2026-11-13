// The guide's pictures: flat scenes with Vee, drawn in SVG (no images to ship, sharp at any size). Brand colours only:
// cream, shade, the marigold spark, blush, mint for "it worked". Motion is gentle and stops under prefers-reduced-motion.
import type { ReactNode } from "react";

const C = { cream: "#F6EFE3", shade: "#E4D6BF", spark: "#FFB627", blush: "#FF9B7B", eye: "#141412", card: "#171715", card2: "#201f1c",
  line: "#2c2b27", dim: "#8e8e88", ink: "#f2f2f0", mint: "#7fd6a1" };

/** Vee inside a scene. `x`,`y` is the top-left of its 256 box, `s` its size in scene units. */
export function VeeG({ x, y, s, mood = "idle", cls = "ga-bob" }: { x: number; y: number; s: number; mood?: "idle" | "happy" | "working"; cls?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s / 256})`}>
      <g className={cls}>
        <path d="M128 72v-18" stroke={C.shade} strokeWidth="8" strokeLinecap="round" />
        <path className={mood === "working" ? "ga-spin" : "ga-twinkle"} d="M128 22q4 14 18 18q-14 4-18 18q-4-14-18-18q14-4 18-18z" fill={C.spark} />
        <path d="M128 70c54 0 84 36 84 82c0 40-32 66-84 66s-84-26-84-66c0-46 30-82 84-82z" fill={C.shade} />
        <path d="M124 70c50 0 78 32 78 74c0 34-28 56-76 56s-74-22-74-56c0-42 26-74 72-74z" fill={C.cream} />
        {mood === "happy" ? (
          <g stroke={C.eye} strokeWidth="6" strokeLinecap="round" fill="none"><path d="M95 144q10-12 20 0" /><path d="M141 144q10-12 20 0" /></g>
        ) : (
          <g className="ga-blink">
            <ellipse cx="105" cy="140" rx="10" ry="14" fill={C.eye} /><ellipse cx="151" cy="140" rx="10" ry="14" fill={C.eye} />
            <circle cx="108.5" cy="134" r="3.6" fill="#fff" /><circle cx="154.5" cy="134" r="3.6" fill="#fff" />
          </g>
        )}
        <ellipse cx="86" cy="164" rx="12" ry="7" fill={C.blush} /><ellipse cx="170" cy="164" rx="12" ry="7" fill={C.blush} />
        {mood === "happy" ? <path d="M116 160q12 14 24 0z" fill={C.eye} /> : <path d="M120 162q8 8 16 0" stroke={C.eye} strokeWidth="5" strokeLinecap="round" fill="none" />}
      </g>
    </g>
  );
}

const Spark = ({ x, y, r = 8, d = 0 }: { x: number; y: number; r?: number; d?: number }) => (
  <path className="ga-twinkle" style={{ animationDelay: `${d}s` }}
    d={`M${x} ${y - r}q${r * .22} ${r * .78} ${r} ${r}q-${r * .78} ${r * .22}-${r} ${r}q-${r * .22}-${r * .78}-${r}-${r}q${r * .78}-${r * .22} ${r}-${r}z`} fill={C.spark} />
);
const Dots = () => (
  <g opacity=".5">{Array.from({ length: 7 }, (_, i) => Array.from({ length: 4 }, (_, j) => <circle key={`${i}-${j}`} cx={36 + i * 68} cy={30 + j * 72} r="1.6" fill={C.line} />))}</g>
);
const Laptop = ({ x, y, w = 180, children }: { x: number; y: number; w?: number; children?: ReactNode }) => {
  const h = w * 0.62;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="10" fill={C.card2} stroke={C.line} strokeWidth="2" />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} rx="5" fill="#0d0d0c" />
      {children}
      <path d={`M${x - 16} ${y + h + 2}h${w + 32}l-10 12h-${w + 12}z`} fill={C.shade} />
      <rect x={x + w / 2 - 18} y={y + h + 2} width="36" height="4" rx="2" fill="#cfc0a6" />
    </g>
  );
};
const Cloud = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M30 90c-17 0-30-12-30-28s13-28 30-28c3-20 21-34 42-34c18 0 33 10 39 25c4-2 9-3 14-3c19 0 34 15 34 34c0 1 0 2 0 3c12 3 20 13 20 25c0 3 0 6-1 6z" fill={C.shade} />
    <path d="M30 84c-15 0-26-10-26-24s11-24 26-24c3-18 19-30 38-30c16 0 30 9 36 23c4-2 9-3 13-3c17 0 31 13 31 30v3c11 3 19 12 19 22z" fill={C.cream} />
  </g>
);
const Pill = ({ x, y, w, text, tone = C.card2, color = C.ink }: { x: number; y: number; w: number; text: string; tone?: string; color?: string }) => (
  <g><rect x={x} y={y} width={w} height="26" rx="13" fill={tone} stroke={C.line} /><text x={x + w / 2} y={y + 17.5} textAnchor="middle" fontSize="12" fontWeight="600" fill={color} fontFamily="Geist, sans-serif">{text}</text></g>
);
const Check = ({ x, y, r = 14 }: { x: number; y: number; r?: number }) => (
  <g className="ga-pop"><circle cx={x} cy={y} r={r} fill={C.mint} /><path d={`M${x - r * .4} ${y}l${r * .28} ${r * .3}l${r * .55}-${r * .6}`} stroke="#0d2617" strokeWidth={r * .22} fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
);
const Wave = ({ x, y, n = 9, h = 34, gap = 9, color = C.spark }: { x: number; y: number; n?: number; h?: number; gap?: number; color?: string }) => (
  <g>{Array.from({ length: n }, (_, i) => {
    const k = [0.4, 0.75, 1, 0.6, 0.9, 0.5, 0.8, 0.45, 0.7][i % 9];
    return <rect key={i} className="ga-eq" style={{ animationDelay: `${i * 0.11}s` }} x={x + i * gap} y={y - (h * k) / 2} width="5" height={h * k} rx="2.5" fill={color} />;
  })}</g>
);
const Card = ({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: ReactNode }) => (
  <g><rect x={x} y={y} width={w} height={h} rx="12" fill={C.card} stroke={C.line} strokeWidth="1.5" />{children}</g>
);
const Mic = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-14" y="-34" width="28" height="46" rx="14" fill={C.cream} />
    <path d="M-12 -18h10M-12 -8h10" stroke={C.shade} strokeWidth="3" strokeLinecap="round" />
    <path d="M-22 0c0 14 10 24 22 24s22-10 22-24" stroke={C.shade} strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M0 24v14M-12 38h24" stroke={C.shade} strokeWidth="4" strokeLinecap="round" />
  </g>
);

export type Scene = "studio" | "install" | "unlock" | "models" | "engine" | "voice" | "cloud" | "keys" | "connect" | "gpu" | "mcp" | "update" | "help";

const SCENES: Record<Scene, () => ReactNode> = {
  studio: () => (<>
    <Dots />
    <Laptop x={150} y={58} w={190}><Wave x={190} y={117} n={13} h={46} gap={9} /></Laptop>
    <g className="ga-float" style={{ animationDelay: ".2s" }}><Card x={40} y={46} w={88} h={64}><Mic x={84} y={84} s={.62} /></Card></g>
    <g className="ga-float" style={{ animationDelay: ".9s" }}><Card x={366} y={36} w={84} h={66}><rect x="380" y="50" width="56" height="38" rx="6" fill={C.card2} /><circle cx="394" cy="62" r="5" fill={C.spark} /><path d="M380 88l18-18l12 10l10-8l16 16z" fill={C.shade} /></Card></g>
    <g className="ga-float" style={{ animationDelay: "1.5s" }}><Card x={372} y={150} w={80} h={70}><path d="M386 204l14-16l12 8l20-24" stroke={C.mint} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="432" cy="172" r="4" fill={C.mint} /></Card></g>
    <VeeG x={44} y={142} s={120} />
    <Spark x={142} y={36} r={9} /><Spark x={352} y={130} r={6} d={.8} />
  </>),
  install: () => (<>
    <Dots />
    <g className="ga-drop"><path d="M240 30v62" stroke={C.spark} strokeWidth="10" strokeLinecap="round" /><path d="M214 72l26 28l26-28" stroke={C.spark} strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
    <path d="M168 128l72-22l72 22v74l-72 24l-72-24z" fill={C.shade} />
    <path d="M168 128l72 22l72-22" fill="none" stroke="#cfc0a6" strokeWidth="3" />
    <path d="M240 150v76" stroke="#cfc0a6" strokeWidth="3" />
    <path d="M168 128l72-22l72 22l-72 22z" fill={C.cream} />
    <Pill x={64} y={236} w={84} text="Mac" /><Pill x={198} y={236} w={84} text="Windows" /><Pill x={332} y={236} w={84} text="Linux" />
    <VeeG x={330} y={90} s={104} mood="happy" />
    <Spark x={130} y={70} r={8} /><Spark x={110} y={150} r={5} d={1} />
  </>),
  unlock: () => (<>
    <Dots />
    <Card x={96} y={40} w={288} h={176}>
      <circle cx="118" cy="60" r="5" fill="#3a3a36" /><circle cx="134" cy="60" r="5" fill="#3a3a36" /><circle cx="150" cy="60" r="5" fill="#3a3a36" />
      <rect x="124" y="84" width="40" height="40" rx="10" fill={C.card2} /><path d="M144 94v14M144 114v2" stroke={C.spark} strokeWidth="5" strokeLinecap="round" />
      <rect x="180" y="88" width="170" height="10" rx="5" fill="#3a3a36" /><rect x="180" y="108" width="120" height="8" rx="4" fill={C.line} />
      <rect x="180" y="164" width="76" height="30" rx="8" fill={C.card2} stroke={C.line} /><text x="218" y="184" textAnchor="middle" fontSize="12.5" fill={C.dim} fontFamily="Geist, sans-serif">Cancel</text>
      <rect className="ga-ring" x="266" y="164" width="84" height="30" rx="8" fill={C.spark} /><text x="308" y="184" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#1a1306" fontFamily="Geist, sans-serif">Open</text>
    </Card>
    <g className="ga-poke"><path d="M322 206l0 34l9-9l7 15l7-3l-7-15l12 0z" fill={C.ink} stroke="#0d0d0c" strokeWidth="2" strokeLinejoin="round" /></g>
    <VeeG x={20} y={150} s={100} />
  </>),
  models: () => (<>
    <Dots />
    <rect x="40" y="200" width="250" height="10" rx="5" fill={C.shade} />
    {[{ x: 56, l: "Voice", c: C.blush }, { x: 134, l: "Subtitles", c: C.cream }, { x: 212, l: "Images", c: C.spark }].map((b, i) => (
      <g key={b.l} className="ga-float" style={{ animationDelay: `${i * .4}s` }}>
        <rect x={b.x} y={128} width="66" height="72" rx="10" fill={C.card2} stroke={C.line} strokeWidth="2" />
        <rect x={b.x + 10} y={140} width="46" height="8" rx="4" fill={b.c} />
        <text x={b.x + 33} y={178} textAnchor="middle" fontSize="11" fontWeight="600" fill={C.ink} fontFamily="Geist, sans-serif">{b.l}</text>
      </g>
    ))}
    <path className="ga-dash" d="M268 124c40-60 90-60 116-30" stroke={C.spark} strokeWidth="4" fill="none" strokeDasharray="8 10" strokeLinecap="round" />
    <path d="M374 84l14 12l-18 4" stroke={C.spark} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Laptop x={330} y={110} w={120}><Check x={390} y={146} r={16} /></Laptop>
    <VeeG x={80} y={20} s={96} mood="happy" />
  </>),
  engine: () => (<>
    <Dots />
    <rect x="130" y="70" width="220" height="150" rx="20" fill={C.card2} stroke={C.line} strokeWidth="2" />
    <g className="ga-spin-slow"><circle cx="200" cy="140" r="34" fill="none" stroke={C.shade} strokeWidth="14" strokeDasharray="14 9" /><circle cx="200" cy="140" r="14" fill={C.shade} /></g>
    <g className="ga-spin-rev"><circle cx="266" cy="118" r="22" fill="none" stroke={C.spark} strokeWidth="10" strokeDasharray="10 7" /><circle cx="266" cy="118" r="8" fill={C.spark} /></g>
    <rect x="248" y="170" width="76" height="30" rx="15" fill={C.mint} /><circle cx="309" cy="185" r="11" fill="#0d2617" />
    <circle className="ga-pulse" cx="150" cy="90" r="6" fill={C.mint} />
    <VeeG x={340} y={128} s={100} mood="working" />
    <Spark x={110} y={70} r={8} />
  </>),
  voice: () => (<>
    <Dots />
    <Mic x={150} y={150} s={1.6} />
    {[0, 1, 2].map((i) => <path key={i} className="ga-wave" style={{ animationDelay: `${i * .35}s` }} d={`M${196 + i * 18} ${110 - i * 8}q${16 + i * 6} ${40 + i * 8} 0 ${80 + i * 16}`} stroke={C.spark} strokeWidth="5" fill="none" strokeLinecap="round" />)}
    <g className="ga-float"><path d="M290 40h150a14 14 0 0 1 14 14v52a14 14 0 0 1-14 14h-110l-22 20v-20h-18a14 14 0 0 1-14-14v-52a14 14 0 0 1 14-14z" fill={C.cream} />
      <text x="368" y="88" textAnchor="middle" fontSize="24" fontWeight="700" fill={C.eye} fontFamily="Geist, sans-serif">Hello!</text></g>
    <VeeG x={300} y={130} s={110} mood="happy" />
  </>),
  cloud: () => (<>
    <Dots />
    <Cloud x={150} y={30} s={1.15} />
    <VeeG x={216} y={-6} s={64} mood="happy" />
    <path className="ga-dash" d="M240 180v-40" stroke={C.spark} strokeWidth="4" strokeDasharray="7 8" strokeLinecap="round" />
    <Laptop x={176} y={186} w={128} />
    <g className="ga-float" style={{ animationDelay: ".6s" }}><Pill x={318} y={150} w={150} text="your-studio.workers.dev" tone={C.card2} color={C.spark} /></g>
    <Spark x={120} y={60} r={9} /><Spark x={380} y={60} r={6} d={.6} /><Spark x={96} y={190} r={5} d={1.2} />
  </>),
  keys: () => (<>
    <Dots />
    <g transform="translate(110 60)">
      <ellipse cx="60" cy="130" rx="60" ry="18" fill={C.shade} /><rect x="0" y="20" width="120" height="110" fill={C.shade} />
      <ellipse cx="60" cy="90" rx="60" ry="18" fill="#d9c9ae" /><rect x="0" y="20" width="120" height="70" fill={C.shade} />
      <ellipse cx="60" cy="55" rx="60" ry="18" fill="#d9c9ae" /><rect x="0" y="20" width="120" height="35" fill={C.shade} />
      <ellipse cx="60" cy="20" rx="60" ry="18" fill={C.cream} />
    </g>
    <g className="ga-float" style={{ animationDelay: ".5s" }}>
      <circle cx="320" cy="110" r="30" fill="none" stroke={C.spark} strokeWidth="14" />
      <path d="M346 126l70 44M392 156l-12 18M408 166l-10 16" stroke={C.spark} strokeWidth="14" strokeLinecap="round" />
    </g>
    <VeeG x={300} y={160} s={86} mood="happy" />
    <Spark x={90} y={50} r={7} />
  </>),
  connect: () => (<>
    <Dots />
    <Laptop x={36} y={110} w={140}><VeeG x={84} y={124} s={44} cls="" /></Laptop>
    <Cloud x={300} y={80} s={.95} />
    <path className="ga-dash" d="M196 170c50 0 60-50 110-50" stroke={C.spark} strokeWidth="5" fill="none" strokeDasharray="10 9" strokeLinecap="round" />
    <rect x="232" y="132" width="34" height="24" rx="6" fill={C.cream} /><path d="M266 138h10M266 150h10" stroke={C.cream} strokeWidth="4" strokeLinecap="round" />
    <Check x={384} y={120} r={18} />
    <Spark x={250} y={70} r={8} />
  </>),
  gpu: () => (<>
    <Dots />
    <rect x="40" y="120" width="190" height="90" rx="12" fill={C.card2} stroke={C.line} strokeWidth="2" />
    {[90, 170].map((cx) => <g key={cx} className="ga-spin"><circle cx={cx} cy="165" r="30" fill="#0d0d0c" /><path d={`M${cx} 140v50M${cx - 25} 165h50M${cx - 18} 147l36 36M${cx + 18} 147l-36 36`} stroke={C.shade} strokeWidth="5" strokeLinecap="round" /></g>)}
    <rect x="60" y="210" width="150" height="10" rx="3" fill={C.spark} />
    <path className="ga-dash" d="M236 150c50-40 80-50 110-50" stroke={C.spark} strokeWidth="5" fill="none" strokeDasharray="10 9" strokeLinecap="round" />
    <Cloud x={300} y={50} s={.9} />
    <VeeG x={60} y={18} s={100} mood="working" />
  </>),
  mcp: () => (<>
    <Dots />
    {[{ y: 40, t: "Claude" }, { y: 110, t: "ChatGPT" }, { y: 180, t: "Cursor" }].map((b, i) => (
      <g key={b.t} className="ga-float" style={{ animationDelay: `${i * .5}s` }}>
        <rect x="30" y={b.y} width="120" height="48" rx="14" fill={C.card2} stroke={C.line} strokeWidth="2" />
        <circle cx="54" cy={b.y + 24} r="9" fill={i === 0 ? C.blush : i === 1 ? C.cream : C.spark} />
        <text x="70" y={b.y + 29} fontSize="13" fontWeight="600" fill={C.ink} fontFamily="Geist, sans-serif">{b.t}</text>
        <path className="ga-dash" d={`M150 ${b.y + 24}C200 ${b.y + 24} 200 138 236 138`} stroke={C.spark} strokeWidth="3.5" fill="none" strokeDasharray="7 7" />
      </g>
    ))}
    <circle cx="300" cy="138" r="66" fill={C.card} stroke={C.line} strokeWidth="2" />
    <VeeG x={248} y={78} s={104} mood="happy" />
    {[{ y: 54, c: C.blush }, { y: 128, c: C.spark }, { y: 202, c: C.mint }].map((t, i) => <rect key={i} className="ga-pop" style={{ animationDelay: `${.3 + i * .25}s` }} x="402" y={t.y} width="40" height="24" rx="7" fill={t.c} />)}
  </>),
  update: () => (<>
    <Dots />
    <g className="ga-spin-slow">
      <path d="M240 54a86 86 0 0 1 82 60" stroke={C.spark} strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M308 100l16 18l10-24" stroke={C.spark} strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M240 226a86 86 0 0 1-82-60" stroke={C.shade} strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M172 180l-16-18l-10 24" stroke={C.shade} strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <VeeG x={186} y={84} s={108} mood="happy" cls="ga-hop" />
    <g className="ga-float"><Pill x={340} y={40} w={84} text="New!" tone={C.spark} color="#1a1306" /></g>
    <Spark x={110} y={70} r={8} /><Spark x={380} y={210} r={6} d={.7} />
  </>),
  help: () => (<>
    <Dots />
    <g className="ga-spin-slow">
      <circle cx="190" cy="150" r="80" fill="none" stroke={C.cream} strokeWidth="34" />
      {[0, 90, 180, 270].map((a) => <path key={a} d="M190 70a80 80 0 0 1 30 6" transform={`rotate(${a - 10} 190 150)`} stroke={C.blush} strokeWidth="34" fill="none" />)}
    </g>
    <VeeG x={140} y={96} s={100} />
    <g className="ga-float"><path d="M330 46h110a14 14 0 0 1 14 14v40a14 14 0 0 1-14 14h-80l-18 16v-16h-12a14 14 0 0 1-14-14v-40a14 14 0 0 1 14-14z" fill={C.card2} stroke={C.line} strokeWidth="2" />
      <text x="384" y="88" textAnchor="middle" fontSize="26" fontWeight="800" fill={C.spark} fontFamily="Geist, sans-serif">?</text></g>
  </>),
};

export function Art({ scene, className = "" }: { scene: Scene; className?: string }) {
  return (
    <svg viewBox="0 0 480 280" className={`ga ${className}`} role="img" aria-hidden>
      {SCENES[scene]()}
    </svg>
  );
}
