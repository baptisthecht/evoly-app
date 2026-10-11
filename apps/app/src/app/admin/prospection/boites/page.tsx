import type { Metadata } from "next";
import Link from "next/link";
import type { ProspectMailbox } from "@evoly/db";
import { requireStaff } from "@/server/platform";
import { listMailboxes, rampCap } from "@/server/prospection";
import { deleteMailboxAction, saveMailboxAction, testMailboxAction, testSendAction, toggleMailboxAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Boîtes d'envoi - Back-office Evoly", robots: { index: false, follow: false } };

const card = "rounded-2xl bg-surface-raised p-5 ring-1 ring-line";
const champ = "h-11 min-w-0 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong";
const bouton = "h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong";
const jour = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);

function Champs({ b }: { b?: ProspectMailbox }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        Nom affiché
        <input name="fromName" required defaultValue={b?.fromName ?? "Baptist Hecht (Evoly)"} className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Adresse e-mail
        <input name="address" type="email" required defaultValue={b?.address} placeholder="baptist@baptisthecht.fr" className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Serveur d&apos;envoi (SMTP)
        <input name="smtpHost" required defaultValue={b?.smtpHost} placeholder="mail.baptisthecht.fr" className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Port
        <input name="smtpPort" type="number" defaultValue={b?.smtpPort ?? 465} className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Serveur de réception (IMAP, le même si vide)
        <input name="imapHost" defaultValue={b?.imapHost ?? ""} placeholder="mail.baptisthecht.fr" className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Port de réception
        <input name="imapPort" type="number" defaultValue={b?.imapPort ?? 993} className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Identifiant (l&apos;adresse si vide)
        <input name="username" defaultValue={b && b.username !== b.address ? b.username : ""} className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Mot de passe{b ? " (vide : inchangé)" : ""}
        <input name="password" type="password" autoComplete="new-password" required={!b} className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Plafond par jour après la montée en charge
        <input name="maxPerDay" type="number" min={1} max={500} defaultValue={b?.maxPerDay ?? 40} className={champ} />
      </label>
      <label className="grid gap-1 text-sm">
        Début de la montée en charge
        <input name="startedAt" type="date" defaultValue={jour(b?.startedAt ?? new Date())} className={champ} />
      </label>
    </div>
  );
}

/** Boîtes d'envoi de la prospection : ajout, modification, test de connexion, activation. */
export default async function BoitesPage({ searchParams }: { searchParams: Promise<{ info?: string }> }) {
  await requireStaff("ADMIN");
  const { info } = await searchParams;
  const boxes = await listMailboxes();
  const now = new Date();
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-3xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-[-0.04em]">Boîtes d&apos;envoi</h1>
          <nav className="flex gap-4 text-sm underline underline-offset-4">
            <Link href="/admin/prospection">Prospection</Link>
            <Link href="/admin">Back-office</Link>
          </nav>
        </header>
        <p className="text-sm text-ink-muted">
          Chaque boîte monte en charge toute seule : 15 e-mails par jour la première semaine, 25 la deuxième, puis son plafond. Jamais une adresse en evoly.me :
          les billets des clients en partent.
        </p>
        {info ? (
          <p role="status" className={`${card} text-sm`}>
            {info}
          </p>
        ) : null}
        {boxes.map((b) => (
          <section key={b.id} className={`${card} grid gap-3`} aria-label={b.address}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="break-all font-semibold">{b.address}</p>
              <p className="text-sm">{b.active ? `${rampCap(b.startedAt, b.maxPerDay, now)} e-mails par jour aujourd'hui` : "Désactivée"}</p>
            </div>
            <p className="text-sm text-ink-muted">
              {b.smtpHost}:{b.smtpPort} · plafond {b.maxPerDay} · depuis le {jour(b.startedAt)}
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={testMailboxAction.bind(null, b.id)}>
                <button type="submit" className={bouton}>
                  Tester la connexion
                </button>
              </form>
              <form action={toggleMailboxAction.bind(null, b.id, !b.active)}>
                <button type="submit" className={bouton}>
                  {b.active ? "Désactiver" : "Réactiver"}
                </button>
              </form>
              <form action={deleteMailboxAction.bind(null, b.id)}>
                <button type="submit" className={bouton}>
                  Supprimer
                </button>
              </form>
            </div>
            <form action={testSendAction.bind(null, b.id)} className="flex flex-wrap gap-2">
              <input name="to" type="email" placeholder={`À (vide : ${b.address})`} aria-label="Adresse du test" className={`${champ} flex-1`} />
              <button type="submit" className={bouton}>
                M&apos;envoyer un test
              </button>
            </form>
            <details>
              <summary className="cursor-pointer text-sm">Modifier</summary>
              <form action={saveMailboxAction.bind(null, b.id)} className="mt-3 grid gap-3">
                <Champs b={b} />
                <div>
                  <button type="submit" className={bouton}>
                    Enregistrer
                  </button>
                </div>
              </form>
            </details>
          </section>
        ))}
        <section className={`${card} grid gap-3`} aria-label="Ajouter une boîte">
          <h2 className="font-display text-xl">Ajouter une boîte</h2>
          <form action={saveMailboxAction.bind(null, null)} className="grid gap-3">
            <Champs />
            <div>
              <button type="submit" className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)]">
                Ajouter la boîte
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
