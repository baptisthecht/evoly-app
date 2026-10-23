import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/server/platform";
import {
  lotEmails,
  pipelineStats,
  prospectionOverview,
} from "@/server/prospection";
import {
  checkPendingAddressesAction,
  retryAction,
  scheduleWaitingAction,
  sendNowAction,
  withdrawAction,
} from "./actions";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Prospection - Back-office Evoly",
  robots: { index: false, follow: false },
};

const card = "rounded-2xl bg-surface-raised p-5 ring-1 ring-line";
const ETAT: Record<string, string> = {
  A_ENVOYER: "En attente",
  PROGRAMME: "Programmé",
  ENVOYE: "Envoyé",
  ECHEC: "Échec",
  RETIRE: "Retiré",
};
const INFO: Record<string, string> = {
  programme: "E-mails programmés : ils partent un à un depuis chaque boîte.",
  adresses_ecartees:
    "Adresses vérifiées : celles qui rebondiraient ont été écartées, avec la raison en note du prospect (statut Exclu).",
  adresses_ok:
    "Adresses vérifiées : toutes les adresses en attente sont valides.",
  limite: "Plus de place aujourd'hui : les e-mails restants attendent demain.",
  envoye: "E-mail envoyé.",
  echec: "L'envoi a échoué : le détail est indiqué sous l'e-mail.",
};
const heure = (d: Date) =>
  new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
const bouton =
  "h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong";

/** Prospection d'Evoly : capacité du jour toutes boîtes confondues, import du lot réparti entre les boîtes, suivi des envois. */
export default async function ProspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string; info?: string }>;
}) {
  await requireStaff("ADMIN");
  const { lot: choisi, info } = await searchParams;
  const [o, suivi] = await Promise.all([
    prospectionOverview(),
    pipelineStats(),
  ]);
  const lot = choisi ?? o.lots[0]?.lot;
  const emails = lot ? await lotEmails(lot) : [];
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-4xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-[-0.04em]">
            Prospection
          </h1>
          <nav className="flex gap-4 text-sm underline underline-offset-4">
            <Link href="/admin/prospection/boites">Boîtes d&apos;envoi</Link>
            <Link href="/admin/prospection/prospects">Prospects</Link>
            <Link href="/admin">Back-office</Link>
          </nav>
        </header>
        {suivi.aRelancer ? (
          <Link
            href="/admin/prospection/prospects?relancer=1"
            className={`${card} text-sm underline-offset-4 hover:underline`}
          >
            {suivi.aRelancer} prospect(s) à relancer aujourd&apos;hui
          </Link>
        ) : null}
        {info && INFO[info] ? (
          <p role="status" className={`${card} text-sm`}>
            {INFO[info]}
          </p>
        ) : null}
        <section
          className={`${card} grid gap-3`}
          aria-label="Envois disponibles aujourd'hui"
        >
          <p className="text-sm text-ink-muted">
            Envois disponibles aujourd&apos;hui, toutes boîtes confondues
          </p>
          <p className="font-display text-5xl tracking-[-0.04em]">
            {o.disponibles}
          </p>
          <p className="text-sm text-ink-muted">
            {o.plageTerminee
              ? `La plage d'envoi du jour est terminée : un lot collé maintenant part demain dès ${o.plage[0].replace(":", " h ")}.`
              : `Envois de ${o.plage[0].replace(":", " h ")} à ${o.plage[1].replace(":", " h ")}. Au-delà de la place du jour, les e-mails sont programmés les jours suivants.`}
          </p>
          {o.boites.length ? (
            <ul className="grid gap-1 text-sm">
              {o.boites.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap justify-between gap-2 border-t border-line pt-1"
                >
                  <span className="break-all">{b.address}</span>
                  <span>
                    {b.envoyes} envoyé(s) · {b.restants} disponible(s) sur{" "}
                    {b.cap}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">
              Aucune boîte active :{" "}
              <Link
                href="/admin/prospection/boites"
                className="underline underline-offset-4"
              >
                ajoute ta première boîte d&apos;envoi
              </Link>
              .
            </p>
          )}
        </section>
        <section className={card} aria-label="Importer un lot">
          <UploadForm />
        </section>
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label="État des envois"
        >
          {[
            [
              "Programmés",
              o.programmes
                ? `${o.programmes}${o.prochain ? `, prochain à ${heure(o.prochain).split(" ").pop()}` : ""}`
                : "0",
            ],
            ["En attente", String(o.aEnvoyer)],
            ["Envoyés au total", String(o.envoyes)],
            ["Échecs", String(o.echecs)],
          ].map(([k, v]) => (
            <div key={k} className={card}>
              <p className="text-xs text-ink-muted">{k}</p>
              <p className="font-display text-xl">{v}</p>
            </div>
          ))}
        </section>
        {o.aEnvoyer > 0 && o.boites.length > 0 ? (
          <form action={scheduleWaitingAction}>
            <button
              type="submit"
              className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)]"
            >
              Programmer les {o.aEnvoyer} e-mail(s) en attente
            </button>
          </form>
        ) : null}
        {/* adresses qui rebondiraient : e-mails retirés, prospects écartés avec la raison en note */}
        <form action={checkPendingAddressesAction}>
          <button
            type="submit"
            className="h-11 rounded-full px-5 font-semibold ring-1 ring-[var(--evoly-charbon)]"
          >
            Vérifier les adresses en attente
          </button>
        </form>
        {o.lots.length ? (
          <nav className="flex flex-wrap gap-2" aria-label="Lots">
            {o.lots.map((l) => (
              <Link
                key={l.lot}
                href={`/admin/prospection?lot=${encodeURIComponent(l.lot)}`}
                className={`rounded-full px-3 py-1 text-sm ring-1 ring-line-strong ${l.lot === lot ? "bg-[var(--evoly-charbon)] text-[var(--evoly-creme)]" : ""}`}
              >
                {l.lot} · {l.total}
              </Link>
            ))}
          </nav>
        ) : null}
        {lot ? (
          <section className="grid gap-3" aria-label={`Lot ${lot}`}>
            <h2 className="font-display text-xl">Lot {lot}</h2>
            {emails.map((e) => (
              <article key={e.id} className={`${card} grid gap-2`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{e.prospect.organisation}</p>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-line-strong">
                    {ETAT[e.status]}
                    {e.status === "PROGRAMME" && e.scheduledAt
                      ? ` · ${heure(e.scheduledAt)}`
                      : ""}
                    {e.status === "ENVOYE" && e.sentAt
                      ? ` · ${heure(e.sentAt)}`
                      : ""}
                  </span>
                </div>
                <p className="break-all text-sm text-ink-muted">
                  {e.toEmail}
                  {e.box?.address || e.mailbox
                    ? ` · depuis ${e.box?.address ?? e.mailbox}`
                    : ""}
                </p>
                <p className="text-sm">
                  <span className="text-ink-muted">Objet : </span>
                  {e.subject}
                </p>
                {e.error ? (
                  <p className="text-sm text-danger">{e.error}</p>
                ) : null}
                <details className="text-sm">
                  <summary className="cursor-pointer">Voir le message</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--evoly-creme)] p-3">
                    {e.body}
                  </p>
                  {e.why ? (
                    <p className="mt-2">Pourquoi eux : {e.why}</p>
                  ) : null}
                  {e.source ? (
                    <p className="mt-1 break-all">
                      Source :{" "}
                      <a
                        href={e.source}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline underline-offset-4"
                      >
                        {e.source}
                      </a>
                    </p>
                  ) : null}
                </details>
                <div className="flex flex-wrap gap-2">
                  {["A_ENVOYER", "PROGRAMME", "ECHEC"].includes(e.status) &&
                  o.boites.length ? (
                    <form action={sendNowAction.bind(null, e.id, lot)}>
                      <button type="submit" className={bouton}>
                        Envoyer maintenant
                      </button>
                    </form>
                  ) : null}
                  {e.status === "ECHEC" ? (
                    <form action={retryAction.bind(null, e.id, lot)}>
                      <button type="submit" className={bouton}>
                        Remettre en attente
                      </button>
                    </form>
                  ) : null}
                  {["A_ENVOYER", "PROGRAMME", "ECHEC"].includes(e.status) ? (
                    <form action={withdrawAction.bind(null, e.id, lot)}>
                      <button type="submit" className={bouton}>
                        Retirer
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : (
          <p className="text-sm text-ink-muted">
            Aucun lot pour l&apos;instant.
          </p>
        )}
      </div>
    </main>
  );
}
