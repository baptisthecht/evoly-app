import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/server/platform";
import { listProspects } from "@/server/prospection";
import { prospectAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prospects - Back-office Evoly", robots: { index: false, follow: false } };

const STATUTS: [string, string][] = [
  ["NOUVEAU", "Nouveau"],
  ["CONTACTE", "Contacté"],
  ["REPONDU", "A répondu"],
  ["CLIENT", "Client"],
  ["PAS_INTERESSE", "Pas intéressé"],
  ["EXCLU", "Exclu (ne plus contacter)"],
];
const card = "rounded-2xl bg-surface-raised p-4 ring-1 ring-line";
const jour = (d: Date) => new Intl.DateTimeFormat("fr-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(d);

/** Suivi des organisations démarchées : statut et notes, modifiables. */
export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string }> }) {
  await requireStaff("ADMIN");
  const { q, statut } = await searchParams;
  const prospects = await listProspects(q?.trim() || undefined, STATUTS.some(([k]) => k === statut) ? statut : undefined);
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-4xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-[-0.04em]">Prospects</h1>
          <nav className="flex gap-4 text-sm underline underline-offset-4">
            <Link href="/admin/prospection">Prospection</Link>
            <Link href="/admin">Back-office</Link>
          </nav>
        </header>
        <form className="grid gap-2 sm:flex" role="search">
          <input
            name="q"
            defaultValue={q ?? ""}
            aria-label="Rechercher"
            placeholder="Organisation ou e-mail"
            className="h-11 min-w-0 rounded-xl bg-surface-raised px-4 ring-1 ring-line-strong sm:flex-1"
          />
          <select name="statut" defaultValue={statut ?? ""} aria-label="Statut" className="h-11 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong">
            <option value="">Tous les statuts</option>
            {STATUTS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="submit" className="h-11 rounded-full bg-[var(--evoly-charbon)] px-5 font-semibold text-[var(--evoly-creme)]">
            Filtrer
          </button>
        </form>
        <p className="text-sm text-ink-muted">{prospects.length} organisation(s)</p>
        {prospects.map((p) => (
          <form key={p.id} action={prospectAction.bind(null, p.id)} className={`${card} grid gap-2`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{p.organisation}</p>
              <p className="text-xs text-ink-muted">
                {p._count.emails} e-mail(s){p.lastContactAt ? ` · dernier contact le ${jour(p.lastContactAt)}` : ""}
              </p>
            </div>
            <p className="break-all text-sm text-ink-muted">{p.email}</p>
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
              <select
                name="status"
                defaultValue={p.status}
                aria-label={`Statut de ${p.organisation}`}
                className="h-10 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong"
              >
                {STATUTS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                name="notes"
                defaultValue={p.notes ?? ""}
                aria-label={`Notes sur ${p.organisation}`}
                placeholder="Notes"
                className="h-10 min-w-0 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong"
              />
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
