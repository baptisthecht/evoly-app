import { formatDate, formatMoney } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { platformDashboard, platformSearch, requireStaff } from "@/server/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Back-office - Evoly", robots: { index: false, follow: false } };

const RISK: Record<string, string> = {
  NEW_ORG_HIGH_PRICE: "Nouvelle organisation, billet à prix élevé",
  HIGH_DISPUTE_RATE: "Taux de litiges anormal",
  MANY_REFUNDS: "Nombreux remboursements",
};
const card = "rounded-2xl bg-surface-raised p-5 ring-1 ring-line";

/** Section 9.24 : tableau de bord et recherche du back-office Evoly. */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const st = await requireStaff("SUPPORT");
  const { q } = await searchParams;
  const [dash, results] = await Promise.all([platformDashboard(), q ? platformSearch(q) : Promise.resolve(null)]);
  const eur = (v: number) => formatMoney(v, "EUR", "fr");
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-6xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-[-0.04em]">Back-office Evoly</h1>
          <p className="text-sm">
            {st.user.name} ·{" "}
            <span className="rounded-full bg-[var(--evoly-charbon)] px-2 py-0.5 text-xs font-bold text-[var(--evoly-creme)]">{st.user.platformRole}</span>
          </p>
        </header>
        <form className="grid gap-2 sm:flex" role="search">
          <input
            name="q"
            defaultValue={q ?? ""}
            aria-label="Rechercher"
            placeholder="Organisation, e-mail, événement, commande, billet, revente"
            className="h-12 w-full min-w-0 sm:flex-1 rounded-xl bg-surface-raised px-4 ring-1 ring-line-strong outline-none focus:ring-2 focus:ring-[var(--evoly-charbon)]"
          />
          <button type="submit" className="h-12 rounded-full bg-[var(--evoly-charbon)] px-6 font-semibold text-[var(--evoly-creme)]">
            Rechercher
          </button>
        </form>
        {results ? (
          <section className={`${card} grid gap-4`} aria-label="Résultats">
            {(
              [
                ["Organisations", results.organizations.map((o) => ({ href: `/admin/organisations/${o.id}`, label: o.name, meta: `${o.slug} · ${o.status}` }))],
                [
                  "Utilisateurs",
                  results.users.map((u) => ({
                    href: u.memberships[0] ? `/admin/organisations/${u.memberships[0].organization.id}` : null,
                    label: `${u.name} <${u.email}>`,
                    meta: u.memberships.map((m) => m.organization.name).join(", ") || "sans organisation",
                  })),
                ],
                [
                  "Événements",
                  results.events.map((e) => ({
                    href: `/admin/organisations/${e.organization.id}`,
                    label: e.title,
                    meta: `${e.organization.name} · ${formatDate(e.startsAt, "Europe/Brussels", "fr")} · ${e.status}`,
                  })),
                ],
                [
                  "Commandes",
                  results.orders.map((o) => ({
                    href: `/admin/organisations/${o.organization.id}`,
                    label: o.reference,
                    meta: `${o.buyerEmail} · ${eur(o.totalMinor)} · ${o.status} · ${o.organization.name}`,
                  })),
                ],
                [
                  "Billets",
                  results.tickets.map((t) => ({
                    href: `/admin/organisations/${t.order.organization.id}`,
                    label: t.shortCode,
                    meta: `${t.status} · ${t.order.reference}`,
                  })),
                ],
                [
                  "Reventes",
                  results.listings.map((l) => ({
                    href: `/admin/organisations/${l.event.organization.id}`,
                    label: l.linkCode,
                    meta: `${l.status} · ${eur(l.priceMinor)} · ${l.event.title}`,
                  })),
                ],
              ] as const
            ).map(([title, rows]) =>
              rows.length ? (
                <div key={title} className="grid gap-1">
                  <h2 className="font-display text-lg">{title}</h2>
                  <ul className="grid gap-1 text-sm">
                    {rows.map((r, i) => (
                      <li key={i}>
                        {r.href ? (
                          <Link href={r.href} className="font-semibold underline underline-offset-4">
                            {r.label}
                          </Link>
                        ) : (
                          <span className="font-semibold">{r.label}</span>
                        )}{" "}
                        <span className="text-ink-muted">· {r.meta}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
            {Object.values(results).every((r) => r.length === 0) ? <p>Aucun résultat.</p> : null}
          </section>
        ) : null}
        <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Indicateurs">
          {[
            ["Ventes (30 j)", eur(dash.grossMinor)],
            ["Commissions (30 j)", eur(dash.commissionMinor)],
            ["Organisations actives", String(dash.activeOrganizations)],
            ["Pro · essais · impayés", `${dash.subscriptions.pro} · ${dash.subscriptions.trialing} · ${dash.subscriptions.pastDue}`],
            ["Taux de litiges (90 j)", `${dash.disputeRate} %`],
            ["Taux de remboursements (90 j)", `${dash.refundRate} %`],
          ].map(([k, v]) => (
            <div key={k} className={card}>
              <p className="text-xs font-bold text-ink-muted">{k}</p>
              <p className="font-display text-2xl tabular-nums">{v}</p>
            </div>
          ))}
        </section>
        <section className={`${card} grid gap-2`} aria-label="Signaux de risque">
          <h2 className="font-display text-lg">Signaux de risque</h2>
          {dash.risky.length === 0 ? <p className="text-sm text-ink-muted">Aucun signal.</p> : null}
          <ul className="grid gap-1 text-sm">
            {dash.risky.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/organisations/${r.id}`} className="font-semibold underline underline-offset-4">
                  {r.name}
                </Link>{" "}
                · {r.risks.map((k) => RISK[k]).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
