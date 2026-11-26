// Your workspaces and the team (creavia/Team.tsx): signed-in only, outside the studio's VoiceBox frame, in Creavia's
// own design. Everything it does goes through /api/ws (owners only for the team's changes; lib/memberships.ts).
import "@/creavia/creavia.css";
import type { Metadata } from "next";
import Team from "@/creavia/Team";
import { requireLogin } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace and team" };

export default async function Account() {
  await requireLogin();
  return <Team />;
}
