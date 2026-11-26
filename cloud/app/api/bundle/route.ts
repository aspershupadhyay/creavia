// The worker code as a .tar.gz, for the one-cell Colab bootstrap. Same secret as the heartbeat.
import { WORKER_BUNDLE_B64, WORKER_VERSION } from "@/lib/bundle";
import { workerWorkspace, scoped } from "@/lib/bound";

export const dynamic = "force-dynamic";

async function getHere(req: Request) {
  // WORKER_SECRET, or Modal's own key (lib/gpus.ts)
  if (!(await (await import("@/lib/gpus")).workerCaller(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return new Response(Buffer.from(WORKER_BUNDLE_B64, "base64"), {
    headers: { "Content-Type": "application/gzip", "X-Worker-Version": WORKER_VERSION, "Cache-Control": "no-store" },
  });
}

// run in the workspace the caller's key names (lib/bound.ts)
export const GET = scoped(workerWorkspace, getHere);
