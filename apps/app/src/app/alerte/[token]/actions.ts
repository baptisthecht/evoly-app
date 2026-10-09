"use server";

import { redirect } from "next/navigation";
import { unsubscribeAlert } from "@/server/alerts";

/** Suppression d'une alerte « Prévenez-moi », sans connexion (RG-PRG-04). */
export async function unsubscribeAlertAction(token: string) {
  const t = token.slice(0, 40);
  await unsubscribeAlert(t);
  redirect(`/alerte/${encodeURIComponent(t)}?done=1`);
}
