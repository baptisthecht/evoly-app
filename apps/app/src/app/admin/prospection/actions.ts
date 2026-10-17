"use server";

import { CoreError } from "@evoly/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/platform";
import {
  cleanPendingAddresses,
  deleteMailbox,
  importLot,
  rebalance,
  retryEmail,
  saveMailbox,
  scheduleWaiting,
  sendNow,
  sendTest,
  setMailboxActive,
  setMailboxLimit,
  testMailbox,
  type ImportReport,
  updateProspect,
  withdrawEmail,
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

/** Vérifie les adresses des e-mails pas encore partis et écarte celles qui rebondiraient. */
export async function checkPendingAddressesAction() {
  await requireStaff("ADMIN");
  const r = await cleanPendingAddresses();
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
  await updateProspect(id, {
    status: String(form.get("status") ?? ""),
    notes: String(form.get("notes") ?? ""),
    nextActionAt: String(form.get("nextActionAt") ?? ""),
  });
  revalidatePath("/admin/prospection/prospects");
  revalidatePath(`/admin/prospection/prospects/${id}`);
}

/** Changement de statut en un geste, depuis la fiche du prospect. */
export async function prospectStatusAction(id: string, status: string) {
  await requireStaff("ADMIN");
  await updateProspect(id, { status });
  revalidatePath(`/admin/prospection/prospects/${id}`);
  revalidatePath("/admin/prospection/prospects");
}

// ---------------------------------------------------------------- boîtes d'envoi

const boites = (info: string) => redirect(`/admin/prospection/boites?info=${encodeURIComponent(info)}`);

const local = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
function jourLabel(jour: string) {
  const now = new Date();
  if (jour === local(now)) return "aujourd'hui";
  if (jour === local(new Date(now.getTime() + 86_400_000))) return "demain";
  return new Intl.DateTimeFormat("fr-BE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" }).format(new Date(`${jour}T12:00:00Z`));
}
/** Après tout changement de boîte, les e-mails pas encore partis sont redistribués ; le message dit comment. */
async function redistribuer(debut: string) {
  const r = await rebalance();
  if (r.programmes === 0 && r.enAttente === 0) return debut;
  const jours = r.parJour.map((j) => `${jourLabel(j.jour)} : ${j.count}`).join(" · ");
  return `${debut} Répartition mise à jour pour ${r.programmes} e-mail(s)${jours ? ` (${jours})` : ""}${r.enAttente ? `, ${r.enAttente} en attente faute de boîte active` : ""}.`;
}

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
        imapHost: champ("imapHost"),
        imapPort: champ("imapPort"),
        username: champ("username"),
        password: champ("password"),
        maxPerDay: champ("maxPerDay"),
        rampUp: form.get("rampUp") === "on",
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
  boites(await redistribuer(id ? "Boîte modifiée." : "Boîte ajoutée. Lance « Tester la connexion » pour vérifier."));
}

export async function toggleMailboxAction(id: string, active: boolean) {
  await requireStaff("ADMIN");
  await setMailboxActive(id, active);
  boites(await redistribuer(active ? "Boîte réactivée." : "Boîte désactivée."));
}

export async function deleteMailboxAction(id: string) {
  await requireStaff("ADMIN");
  await deleteMailbox(id);
  boites(await redistribuer("Boîte supprimée."));
}

export async function testMailboxAction(id: string) {
  await requireStaff("ADMIN");
  const r = await testMailbox(id);
  boites(r.ok ? "Connexion réussie : la boîte peut envoyer." : `Connexion impossible : ${r.error}`);
}

export async function testSendAction(id: string, form: FormData) {
  await requireStaff("ADMIN");
  const r = await sendTest(id, String(form.get("to") ?? ""));
  boites(
    !r.ok
      ? `Envoi impossible : ${r.error}`
      : r.copied
        ? "E-mail de test envoyé, et rangé dans « Envoyés » : vérifie qu'il est bien arrivé."
        : `E-mail de test envoyé, mais pas rangé dans « Envoyés » (${r.error}) : vérifie le serveur de réception.`,
  );
}

export async function setMailboxLimitAction(id: string, form: FormData) {
  await requireStaff("ADMIN");
  try {
    await setMailboxLimit(id, Number(form.get("maxPerDay")), form.get("rampUp") === "on");
  } catch {
    boites("Limite non enregistrée : choisis un nombre entre 1 et 500.");
  }
  boites(await redistribuer("Limite enregistrée."));
}
