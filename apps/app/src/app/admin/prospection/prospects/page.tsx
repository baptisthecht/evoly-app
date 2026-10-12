import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/server/platform";
import { PROSPECT_STATUTS, listProspects, pipelineStats } from "@/server/prospection";
import { prospectAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prospects - Back-office Evoly", robots: { index: false, follow: false } };

const card = "rounded-2xl bg-surface-raised p-4 ring-1 ring-line";
const champ = "h-10 min-w-0 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong";
const LIBELLE = Object.fromEntries(PROSPECT_STATUTS) as Record<string, string>;
const jour = (d: Date) => new Intl.DateTimeFormat("fr-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(d);
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);

/** Suivi des organisations démarchées : chiffres, filtres, statut, relance et notes. */
export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; relancer?: string }> }) {
  await requireStaff("ADMIN");
  const { q, statut, relancer } = await searchParams;
  const valide = PROSPECT_STATUTS.some(([k]) => k === statut) ? statut : undefined;
  const [stats, prospects] = await Promise.all([pipelineStats(), listProspects(q?.trim() || undefined, valide, relancer === "1")]);
  const aujourdhui = new Date();
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-4xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-[-0.04em]">Prospects</h1>
          <nav className="flex gap-4 text-sm underline underline-offset-4">
            <Link href="/admin/prospection">Prospection</Link>
            <a href="/admin/prospection/prospects/export">Exporter (CSV)</a>
          </nav>
        </header>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Chiffres du suivi">
          {[
            ["Contactés", String(stats.contactes)],
            ["Réponses", `${stats.reponses} (${stats.tauxReponse} %)`],
            ["Intéressés", String(stats.interesses)],
            ["Démos prévues", String(stats.rdv)],
            ["Comptes créés", String(stats.inscrits)],
            ["Clients", String(stats.clients)],
            ["Pas intéressés", String(stats.pasInteresses)],
            ["À relancer", String(stats.aRelancer)],
          ].map(([k, v]) => (
            <div key={k} className={card}>
              <p className="text-xs text-ink-muted">{k}</p>
              <p className="font-display text-xl">{v}</p>
            </div>
          ))}
        </section>
        <form className="grid gap-2 sm:flex sm:flex-wrap" role="search">
          <input name="q" defaultValue={q ?? ""} aria-label="Rechercher" placeholder="Organisation, e-mail ou note" className={`${champ} h-11 sm:flex-1`} />
          <select name="statut" defaultValue={valide ?? ""} aria-label="Statut" className={`${champ} h-11`}>
            <option value="">Tous les statuts</option>
            {PROSPECT_STATUTS.map(([k, v]) => (
              <option key={k} value={k}>
                {v} ({stats.parStatut[k] ?? 0})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input name="relancer" type="checkbox" value="1" defaultChecked={relancer === "1"} />À relancer aujourd&apos;hui
          </label>
          <button type="submit" className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)]">
            Filtrer
          </button>
        </form>
        <p className="text-sm text-ink-muted">{prospects.length} organisation(s)</p>
        {prospects.map((p) => (
          <form key={p.id} action={prospectAction.bind(null, p.id)} className={`${card} grid gap-2`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/admin/prospection/prospects/${p.id}`} className="font-semibold underline-offset-4 hover:underline">
                {p.organisation}
              </Link>
              <p className="text-xs text-ink-muted">
                {LIBELLE[p.status]} · {p._count.emails} e-mail(s)
                {p.lastContactAt ? ` · contacté le ${jour(p.lastContactAt)}` : ""}
                {p.nextActionAt ? ` · relance le ${jour(p.nextActionAt)}${p.nextActionAt <= aujourdhui ? " (à faire)" : ""}` : ""}
              </p>
            </div>
            <p className="break-all text-sm text-ink-muted">{p.email}</p>
            <div className="grid gap-2 sm:grid-cols-[14rem_10rem_1fr_auto]">
              <select name="status" defaultValue={p.status} aria-label={`Statut de ${p.organisation}`} className={champ}>
                {PROSPECT_STATUTS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                name="nextActionAt"
                type="date"
                defaultValue={p.nextActionAt ? iso(p.nextActionAt) : ""}
                aria-label={`Relance de ${p.organisation}`}
                className={champ}
              />
              <input name="notes" defaultValue={p.notes ?? ""} aria-label={`Notes sur ${p.organisation}`} placeholder="Notes" className={champ} />
              <button type="submit" className="h-10 rounded-full px-4 text-sm font-semibold ring-1 ring-line-strong">
                Enregistrer
              </button>
            </div>
          </form>
        ))}
      </div>
    </main>
  );
}
