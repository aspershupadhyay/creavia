// Creavia's own parts (creavia.css): Vee, a labelled field, and the trust lines. The first pieces of the shared set
// (docs/town/stages/05-visual-design.md); nothing here comes from VoiceBox's components.
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

/** Vee, the mascot (brand/mascot.svg): flat shapes only. Decorative unless given a label. */
export function Vee({ size = 48, label }: { size?: number; label?: string }) {
  return (
    <svg
      className="cv-vee"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M128 72v-18" stroke="#E4D6BF" strokeWidth="8" strokeLinecap="round" />
      <path d="M128 22q4 14 18 18q-14 4-18 18q-4-14-18-18q14-4 18-18z" fill="#FFB627" />
      <path d="M128 70c54 0 84 36 84 82c0 40-32 66-84 66s-84-26-84-66c0-46 30-82 84-82z" fill="#E4D6BF" />
      <path d="M124 70c50 0 78 32 78 74c0 34-28 56-76 56s-74-22-74-56c0-42 26-74 72-74z" fill="#F6EFE3" />
      <ellipse cx="105" cy="140" rx="10" ry="14" fill="#141412" />
      <ellipse cx="151" cy="140" rx="10" ry="14" fill="#141412" />
      <circle cx="108.5" cy="134" r="3.6" fill="#FFFFFF" />
      <circle cx="154.5" cy="134" r="3.6" fill="#FFFFFF" />
      <ellipse cx="86" cy="164" rx="12" ry="7" fill="#FF9B7B" />
      <ellipse cx="170" cy="164" rx="12" ry="7" fill="#FF9B7B" />
      <path d="M120 162q8 8 16 0" stroke="#141412" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Creavia's name with Vee: the top of every account screen. */
export function Brand() {
  return (
    <div className="cv-brand">
      <Vee size={30} />
      Creavia
    </div>
  );
}

/** A labelled input; the hint and the error are tied to it for screen readers. */
export function Field({
  id,
  label,
  hint,
  invalid,
  errorId,
  ...input
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  invalid?: boolean;
  errorId?: string;
  ref?: Ref<HTMLInputElement>;
} & InputHTMLAttributes<HTMLInputElement>) {
  const described =
    [hint ? `${id}-hint` : "", invalid && errorId ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="cv-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={invalid || undefined} aria-describedby={described} {...input} />
      {hint ? (
        <span className="cv-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** What Creavia promises, in plain words: shown where people decide to trust it (docs/town/stages/04-ux.md, pattern 10). */
export function Trust() {
  return (
    <ul className="cv-trust">
      <li>Your workspace is yours. Nobody outside it can see your posts, files or messages.</li>
      <li>Nothing posts or sends by itself unless you switch it on.</li>
      <li>Invite your editor or manager when you're ready, and choose who can manage the team.</li>
    </ul>
  );
}
