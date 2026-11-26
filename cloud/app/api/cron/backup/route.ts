// The nightly backup (lib/backup.ts), knocked by .github/workflows/sweep.yml every 10 min beside the sweep: it only
// does something once a day after 02:00 UTC (and while a models copy is catching up), so most knocks read one small
// file and stop. Its own function, so the sweep's autopilot keeps all of its time. Same secret as the sweep.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  // WORKER_SECRET, CRON_SECRET, or GitHub's OIDC token for sweep.yml (lib/cronauth.ts: no secret to copy into GitHub)
  if (!(await (await import("@/lib/cronauth")).cronAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    // the backup is the service's (the whole database, and every workspace's models: lib/backup.ts)
    const out = await (await import("@/lib/backup")).nightly(200_000);
    // then each workspace's files are cleared of what nothing needs any more (lib/janitor.ts), once a day
    const { forEachWorkspace, oneOrAll } = await import("@/lib/workspaces");
    const nightlyClean = (await import("@/lib/janitor")).nightlyClean;
    const cleaned = oneOrAll(await forEachWorkspace(() => nightlyClean(), 60_000)) as Record<string, unknown> | null;
    return Response.json(out || cleaned ? { ...(out ?? {}), ...(cleaned ? { cleaned } : {}) } : { idle: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
