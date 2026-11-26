// The way in (creavia/Gate.tsx): which ways are switched on here decides what the screen offers. Everything it does
// goes through /api/login (lib/signin.ts decides who may get in, and where).
import "@/creavia/creavia.css";
import type { Metadata } from "next";
import Gate from "@/creavia/Gate";
import { githubEnabled, githubHref, safeNext } from "@/lib/github";
import { googleEnabled } from "@/lib/google";
import { mailerReady } from "@/lib/mailer";
import { openSignup } from "@/lib/signin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

type Search = { next?: string; invite?: string; verify?: string; reset?: string; mode?: string };
const tokenOf = (v?: string) => (v && /^[A-Za-z0-9_-]{16,128}$/.test(v) ? v : undefined);

export default async function Login({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const next = safeNext(q.next);
  return (
    <Gate
      next={next}
      github={githubEnabled() ? githubHref(next) : undefined}
      google={googleEnabled()}
      mail={mailerReady()}
      open={openSignup()}
      invite={tokenOf(q.invite)}
      verify={tokenOf(q.verify)}
      reset={tokenOf(q.reset)}
      start={q.mode === "signup" ? "signup" : undefined}
    />
  );
}
