// The minute knock for publishing: the Cloudflare timer (workers/live-timer.js) POSTs here every minute while
// workspace/publish/active.json says a plan is on its way out (lib/publish/plans.ts writes it), and every unfinished
// plan is carried on inside this request (lib/publish/run.ts carryOn). Not after the response: Cloudflare stops after()
// work 30 s later, which is what left a Reel at "processing" for minutes. Locked like the other scheduled routes.
import { carryOn } from "@/lib/publish/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await (await import("@/lib/cronauth")).cronAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    // each workspace's plans on their way out, in turn, sharing the 50 s (lib/workspaces.ts)
    const { forEachWorkspace, oneOrAll } = await import("@/lib/workspaces");
    const out = oneOrAll(await forEachWorkspace((ms) => carryOn(ms), 50_000));
    return Response.json(out, { status: out && typeof out === "object" && "error" in out ? 502 : 200 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
