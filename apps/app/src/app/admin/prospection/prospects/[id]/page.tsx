import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/platform";
import { PROSPECT_STATUTS, prospectDetail } from "@/server/prospection";
import { prospectAction, prospectStatusAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prospect - Back-office Evoly", robots: { index: false, follow: false } };

const card = "rounded-2xl bg-surface-raised p-5 ring-1 ring-line";
const champ = "h-11 min-w-0 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong";
const ETAT: Record<string, string> = { A_ENVOYER: "En attente", PROGRAMME: "Programmé", ENVOYE: "Envoyé", ECHEC: "Échec", RETIRE: "Retiré" };
const quand = (d: Date) =>
  new Intl.DateTimeFormat("fr-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    d,
  );
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);

/** Fiche d'un prospect : statut en un geste, notes, relance, e-mails envoyés et historique. */
export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("ADMIN");
  const { id } = await params;
  const p = await prospectDetail(id);
  if (!p) notFound();
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-3xl gap-5">
        <nav className="flex gap-4 text-sm underline underline-offset-4">
          <Link href="/admin/prospection/prospects">Prospects</Link>
          <Link href="/admin/prospection">Prospection</Link>
        </nav>
        <header className="grid gap-1">
          <h1 className="font-display text-3xl tracking-[-0.04em]">{p.organisation}</h1>
          <p className="break-all text-sm text-ink-muted">
            <a href={`mailto:${p.email}`} className="underline underline-offset-4">
              {p.email}
            </a>
            {p.lastContactAt ? ` · dernier contact le ${quand(p.lastContactAt)}` : ""}
            {p.respondedAt ? ` · première réponse le ${quand(p.respondedAt)}` : ""}
          </p>
          {p.source ? <p className="break-all text-sm text-ink-muted">Source : {p.source}</p> : null}
        </header>
        <section className={`${card} grid gap-3`} aria-label="Statut">
          <p className="text-sm text-ink-muted">Statut</p>
          <div className="flex flex-wrap gap-2">
            {PROSPECT_STATUTS.map(([k, v]) => (
              <form key={k} action={prospectStatusAction.bind(null, p.id, k)}>
                <button
                  type="submit"
                  aria-pressed={p.status === k}
                  className={`h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong ${p.status === k ? "bg-[var(--evoly-charbon)] text-[var(--evoly-creme)]" : ""}`}
                >
                  {v}
                </button>
              </form>
            ))}
          </div>
        </section>
        <form action={prospectAction.bind(null, p.id)} className={`${card} grid gap-3`}>
          <input type="hidden" name="status" value={p.status} />
          <label className="grid gap-1 text-sm">
            Relance ou prochaine action le
            <input name="nextActionAt" type="date" defaultValue={p.nextActionAt ? iso(p.nextActionAt) : ""} className={`${champ} w-48`} />
          </label>
          <label className="grid gap-1 text-sm">
            Notes
            <textarea name="notes" rows={4} defaultValue={p.notes ?? ""} className="w-full rounded-xl bg-surface-raised p-3 ring-1 ring-line-strong" />
          </label>
          <div>
            <button type="submit" className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)]">
              Enregistrer
            </button>
          </div>
        </form>
        <section className="grid gap-3" aria-label="E-mails">
          <h2 className="font-display text-xl">E-mails</h2>
          {p.emails.map((e) => (
            <article key={e.id} className={`${card} grid gap-1`}>
              <p className="text-sm">
                <span className="font-semibold">{e.subject}</span>
              </p>
              <p className="text-xs text-ink-muted">
                {ETAT[e.status]}
                {e.sentAt ? ` le ${quand(e.sentAt)}` : e.scheduledAt ? ` pour le ${quand(e.scheduledAt)}` : ""}
                {e.box?.address || e.mailbox ? ` · depuis ${e.box?.address ?? e.mailbox}` : ""}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer">Voir le message</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--evoly-creme)] p-3">{e.body}</p>
              </details>
            </article>
          ))}
        </section>
        <section className="grid gap-2" aria-label="Historique">
          <h2 className="font-display text-xl">Historique</h2>
          {p.activities.length ? (
            <ul className={`${card} grid gap-1 text-sm`}>
              {p.activities.map((a) => (
                <li key={a.id}>
                  <span className="text-ink-muted">{quand(a.createdAt)} · </span>
                  {a.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">Aucun changement pour l&apos;instant.</p>
          )}
        </section>
      </div>
    </main>
  );
}
