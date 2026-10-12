"use server";

import { redirect } from "next/navigation";
import { leaveWaitlist } from "@/server/waitlist";

/** Désinscription de la liste d'attente, sans connexion (RG-ATT-05). */
export async function leaveWaitlistAction(token: string) {
  const t = token.slice(0, 60);
  await leaveWaitlist(t);
  redirect(`/attente/${encodeURIComponent(t)}?done=1`);
}
