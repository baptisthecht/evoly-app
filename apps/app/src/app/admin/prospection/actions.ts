"use server";

import { CoreError } from "@evoly/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/platform";
import {
  deleteMailbox,
  importLot,
  retryEmail,
  saveMailbox,
  scheduleWaiting,
  sendNow,
  setMailboxActive,
  testMailbox,
  updateProspect,
  withdrawEmail,
  type ImportReport,
} from "@/server/prospection";

export type ImportState = { ok: true; report: ImportReport } | { ok: false; error: string } | null;

const MESSAGES: Record<string, string> = {
  PROSPECTION_LOT_INVALID: "Ce n'est pas un lot valide : il faut un objet avec une liste « emails ».",
  PROSPECTION_LOT_TOO_LARGE: "500 e-mails au maximum par lot.",
};
const back = (lot?: string, info?: string) => {
  const q = new URLSearchParams({ ...(lot ? { lot } : {}), ...(info ? { info } : {}) }).toString();
  redirect(`/admin/prospection${q ? `?${q}` : ""}`);
};

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

export async function scheduleWaitingAction() {
  await requireStaff("ADMIN");
  const r = await scheduleWaiting();
  back(undefined, r.enAttente > 0 ? "limite" : "programme");
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

// ---------------------------------------------------------------- boîtes d'envoi

const boites = (info: string) => redirect(`/admin/prospection/boites?info=${encodeURIComponent(info)}`);

export async function saveMailboxAction(id: string | null, form: FormData) {
  await requireStaff("ADMIN");
  const champ = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  try {
    await saveMailbox(
      {
        fromName: champ("fromName"),
        address: champ("address"),
        smtpHost: champ("smtpHost"),
        smtpPort: champ("smtpPort"),
        username: champ("username"),
        password: champ("password"),
        maxPerDay: champ("maxPerDay"),
        startedAt: champ("startedAt"),
      },
      id ?? undefined,
    );
  } catch (err) {
    boites(
      err instanceof CoreError && err.code === "PROSPECTION_PASSWORD_REQUIRED"
        ? "Le mot de passe est obligatoire pour une nouvelle boîte."
        : "Boîte non enregistrée : vérifie les champs (adresse, serveur, port).",
    );
  }
  boites(id ? "Boîte modifiée." : "Boîte ajoutée. Lance « Tester la connexion » pour vérifier.");
}

export async function toggleMailboxAction(id: string, active: boolean) {
  await requireStaff("ADMIN");
  await setMailboxActive(id, active);
  boites(active ? "Boîte réactivée." : "Boîte désactivée : ses e-mails programmés sont revenus en attente.");
}

export async function deleteMailboxAction(id: string) {
  await requireStaff("ADMIN");
  await deleteMailbox(id);
  boites("Boîte supprimée : ses e-mails programmés sont revenus en attente.");
}

export async function testMailboxAction(id: string) {
  await requireStaff("ADMIN");
  const r = await testMailbox(id);
  boites(r.ok ? "Connexion réussie : la boîte peut envoyer." : `Connexion impossible : ${r.error}`);
}
