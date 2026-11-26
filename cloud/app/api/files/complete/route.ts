// Save a file into Files, step 3 of 3 (lib/inbox.ts): POST {ticket} once the bytes are at upload_url (or {tickets: [...]}
// for several at once). The file is copied into the workspace, filed, attached and put in its carousel; the answer has
// its file id (m:…). Turning a ticket in again is safe: the file isn't copied twice, and a carousel join that failed is
// tried again. Same sign-ins as /api/files/upload.
import { currentUser, isAuthed } from "@/lib/session";
import { completeUpload, completeUploads, uploadKeyOk } from "@/lib/inbox";
import { uploadKeyWorkspace, scoped } from "@/lib/bound";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a 2 GB video is copied 5 MB at a time

async function postHere(req: Request) {
  const key = (await isAuthed(req)) ? null : await uploadKeyOk(req);
  if (!key && !(await isAuthed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const who = key ? null : await currentUser().catch(() => null);
    const actor = key ? { name: `${key.name} (upload key)` } : who ? { id: who.id, name: who.name } : { name: "Upload API" };
    if (Array.isArray(body.tickets)) return Response.json({ saved: await completeUploads(body.tickets.map(String), actor) });
    return Response.json(await completeUpload(String(body.ticket ?? ""), actor));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

// run in the workspace the caller's key names (lib/bound.ts)
export const POST = scoped(uploadKeyWorkspace, postHere);
