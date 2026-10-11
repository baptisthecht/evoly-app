import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/server/platform";
import { lotEmails, prospectionOverview } from "@/server/prospection";
import { retryAction, scheduleLotAction, sendNowAction, withdrawAction } from "./actions";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prospection - Back-office Evoly", robots: { index: false, follow: false } };

const card = "rounded-2xl bg-surface-raised p-5 ring-1 ring-line";
const ETAT: Record<string, string> = { A_ENVOYER: "À envoyer", PROGRAMME: "Programmé", ENVOYE: "Envoyé", ECHEC: "Échec", RETIRE: "Retiré" };
const INFO: Record<string, string> = {
  programme: "Lot programmé : les e-mails partent un à un dans les prochaines heures.",
  limite: "Limite du jour atteinte : les e-mails restants pourront être programmés demain.",
  envoye: "E-mail envoyé.",
  echec: "L'envoi a échoué : le détail est indiqué sous l'e-mail.",
};
const heure = (d: Date) =>
  new Intl.DateTimeFormat("fr-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
const bouton = "h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong";

/** Prospection d'Evoly : import du lot du jour, envoi espacé et suivi, depuis le back-office. */
export default async function ProspectionPage({ searchParams }: { searchParams: Promise<{ lot?: string; info?: string }> }) {
  await requireStaff("ADMIN");
  const { lot: choisi, info } = await searchParams;
  const o = await prospectionOverview();
  const lot = choisi ?? o.lots[0]?.lot;
  const emails = lot ? await lotEmails(lot) : [];
  const aEnvoyer = emails.filter((e) => e.status === "A_ENVOYER").length;
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-4xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-[-0.04em]">Prospection</h1>
          <nav className="flex gap-4 text-sm underline underline-offset-4">
            <Link href="/admin/prospection/prospects">Prospects</Link>
            <Link href="/admin">Back-office</Link>
          </nav>
        </header>
        {!o.configured ? (
          <p className={`${card} text-sm`}>
            La boîte de prospection n&apos;est pas configurée : ajoute PROSPECTION_SMTP_URL et PROSPECTION_FROM dans le fichier .env du serveur (voir
            docs/DEPLOIEMENT.md), puis redéploie.
          </p>
        ) : null}
        {info && INFO[info] ? (
          <p role="status" className={`${card} text-sm`}>
            {INFO[info]}
          </p>
        ) : null}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Aujourd'hui">
          {[
            ["Envoyés aujourd'hui", `${o.sentToday} / ${o.cap}`],
            ["À envoyer", String(o.aEnvoyer)],
            ["Programmés", o.programmes ? `${o.programmes}${o.prochain ? `, prochain ${heure(o.prochain).split(" ").pop()}` : ""}` : "0"],
            ["Échecs", String(o.echecs)],
          ].map(([k, v]) => (
            <div key={k} className={card}>
              <p className="text-xs text-ink-muted">{k}</p>
              <p className="font-display text-xl">{v}</p>
            </div>
          ))}
        </section>
        <section className={card} aria-label="Importer un lot">
          <UploadForm />
        </section>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl">Lot {lot}</h2>
              {aEnvoyer && o.configured ? (
                <form action={scheduleLotAction.bind(null, lot)}>
                  <button type="submit" className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)]">
                    Programmer l&apos;envoi de {aEnvoyer} e-mail(s)
                  </button>
                </form>
              ) : null}
            </div>
            {aEnvoyer && o.configured ? (
              <p className="text-sm text-ink-muted">
                Un e-mail toutes les {Math.round(o.delay[0] / 60)} à {Math.round(o.delay[1] / 60)} minutes, dans la limite de {o.cap} par jour.
              </p>
            ) : null}
            {emails.map((e) => (
              <article key={e.id} className={`${card} grid gap-2`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{e.prospect.organisation}</p>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-line-strong">
                    {ETAT[e.status]}
                    {e.status === "PROGRAMME" && e.scheduledAt ? ` · ${heure(e.scheduledAt)}` : ""}
                    {e.status === "ENVOYE" && e.sentAt ? ` · ${heure(e.sentAt)}` : ""}
                  </span>
                </div>
                <p className="break-all text-sm text-ink-muted">{e.toEmail}</p>
                <p className="text-sm">
                  <span className="text-ink-muted">Objet : </span>
                  {e.subject}
                </p>
                {e.error ? <p className="text-sm text-danger">{e.error}</p> : null}
                <details className="text-sm">
                  <summary className="cursor-pointer">Voir le message</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--evoly-creme)] p-3">{e.body}</p>
                  {e.why ? <p className="mt-2">Pourquoi eux : {e.why}</p> : null}
                  {e.source ? (
                    <p className="mt-1 break-all">
                      Source :{" "}
                      <a href={e.source} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                        {e.source}
                      </a>
                    </p>
                  ) : null}
                </details>
                <div className="flex flex-wrap gap-2">
                  {["A_ENVOYER", "PROGRAMME", "ECHEC"].includes(e.status) && o.configured ? (
                    <form action={sendNowAction.bind(null, e.id, lot)}>
                      <button type="submit" className={bouton}>
                        Envoyer maintenant
                      </button>
                    </form>
                  ) : null}
                  {e.status === "ECHEC" ? (
                    <form action={retryAction.bind(null, e.id, lot)}>
                      <button type="submit" className={bouton}>
                        Remettre à envoyer
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
          <p className="text-sm text-ink-muted">Aucun lot pour l&apos;instant : importe le premier ci-dessus.</p>
        )}
      </div>
    </main>
  );
}
