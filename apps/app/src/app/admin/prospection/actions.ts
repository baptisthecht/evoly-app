"use server";

import { CoreError } from "@evoly/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/platform";
import { importLot, retryEmail, scheduleLot, sendNow, updateProspect, withdrawEmail, type ImportReport } from "@/server/prospection";

export type ImportState = { ok: true; report: ImportReport } | { ok: false; error: string } | null;

const MESSAGES: Record<string, string> = {
  PROSPECTION_LOT_INVALID: "Ce n'est pas un lot valide : il faut un objet avec une liste « emails ».",
  PROSPECTION_LOT_TOO_LARGE: "500 e-mails au maximum par lot.",
};
const back = (lot: string, info?: string) => redirect(`/admin/prospection?lot=${encodeURIComponent(lot)}${info ? `&info=${info}` : ""}`);

export async function importLotAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  await requireStaff("ADMIN");
  const fichier = form.get("fichier");
  let texte = String(form.get("json") ?? "");
  if (fichier instanceof File && fichier.size > 0) {
    if (fichier.size > 2_000_000) return { ok: false, error: "Fichier trop volumineux : 2 Mo au maximum." };
    texte = await fichier.text();
  }
  if (!texte.trim()) return { ok: false, error: "Choisis le fichier JSON du lot, ou colle son contenu." };
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return { ok: false, error: "Le contenu n'est pas du JSON valide." };
  }
  try {
    const report = await importLot(brut);
    revalidatePath("/admin/prospection");
    return { ok: true, report };
  } catch (err) {
    return { ok: false, error: err instanceof CoreError ? (MESSAGES[err.code] ?? err.code) : "Import impossible." };
  }
}

export async function scheduleLotAction(lot: string) {
  await requireStaff("ADMIN");
  const r = await scheduleLot(lot);
  back(lot, r.restants > 0 ? "limite" : "programme");
}

export async function sendNowAction(id: string, lot: string) {
  await requireStaff("ADMIN");
  let info = "envoye";
  try {
    await sendNow(id);
  } catch (err) {
    info = err instanceof CoreError && err.code === "PROSPECTION_DAILY_CAP" ? "limite" : "echec";
  }
  back(lot, info);
}

export async function withdrawAction(id: string, lot: string) {
  await requireStaff("ADMIN");
  await withdrawEmail(id);
  back(lot);
}

export async function retryAction(id: string, lot: string) {
  await requireStaff("ADMIN");
  await retryEmail(id);
  back(lot);
}

export async function prospectAction(id: string, form: FormData) {
  await requireStaff("ADMIN");
  await updateProspect(id, { status: String(form.get("status") ?? ""), notes: String(form.get("notes") ?? "") });
  revalidatePath("/admin/prospection/prospects");
}
