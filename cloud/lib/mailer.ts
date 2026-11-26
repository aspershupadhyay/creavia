// The email port (docs/town/prd/foundation-workspaces-accounts.md, 3b): how the studio sends a password reset or the
// link that checks a new account's email. One sender today, Resend (RESEND_API_KEY and MAIL_FROM on the Worker); with
// neither set there is no email, and what needs it says so (a reset can't be asked for, open sign-up stays off).
export type Email = { to: string; subject: string; text: string };

export const mailerReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

/** Sends one plain-text email. Throws when no sender is set up or the sender refuses it. */
export async function sendEmail(m: Email): Promise<void> {
  if (!mailerReady())
    throw Object.assign(new Error("Email isn't set up on this studio (RESEND_API_KEY, MAIL_FROM)."), { status: 503 });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [m.to], subject: m.subject.slice(0, 200), text: m.text }),
  });
  if (!r.ok) throw new Error(`the email didn't go (${r.status})`);
}
