// The minute timer's knock (Grow → Live): a Cloudflare cron (workers/live-timer.js) POSTs here every minute and
// lib/live.ts reads every fresh post's counters, only while someone has a Grow page open and in use (otherwise it
// answers { idle: true } without asking YouTube or Instagram anything; the timer itself now only knocks while someone
// is watching). Locked like the other scheduled routes (lib/cronauth.ts): the timer's own secret, kept only as a SHA-256.
import { timerTick } from "@/lib/live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await (await import("@/lib/cronauth")).cronAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    // each workspace's live posts, in turn (lib/workspaces.ts); one workspace answers as it always did
    const { forEachWorkspace, oneOrAll } = await import("@/lib/workspaces");
    const out = oneOrAll(await forEachWorkspace(() => timerTick(), 50_000));
    return Response.json(out, { status: out && typeof out === "object" && "error" in out ? 502 : 200 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
