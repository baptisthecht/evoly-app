import { formatDateTime, formatMoney } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { organizationSheet, requireStaff } from "@/server/platform";
import {
  assignPlanAction,
  extendTrialAction,
  featureFlagAction,
  reactivateAction,
  resendOrderAction,
  retryResaleAction,
  suspendAction,
  supportViewAction,
} from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organisation - Back-office Evoly", robots: { index: false, follow: false } };

const card = "rounded-2xl bg-surface-raised p-5 ring-1 ring-line";
const input = "h-11 rounded-xl bg-surface-raised px-3 ring-1 ring-line-strong";
const btn = "h-11 rounded-full bg-[var(--evoly-charbon)] px-5 text-sm font-semibold text-[var(--evoly-creme)]";
const RISK: Record<string, string> = {
  NEW_ORG_HIGH_PRICE: "Nouvelle organisation, billet à prix élevé",
  HIGH_DISPUTE_RATE: "Taux de litiges anormal",
  MANY_REFUNDS: "Nombreux remboursements",
};

/** Section 9.24 : fiche organisation et actions du back-office. */
export default async function OrganizationSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const st = await requireStaff("SUPPORT");
  const { id } = await params;
  const sheet = await organizationSheet(id);
  if (!sheet) notFound();
  const { org } = sheet;
  const admin = st.user.platformRole === "ADMIN";
  const eur = (v: number) => formatMoney(v, org.currency, "fr");
  const sub = org.subscription;
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--evoly-creme)] px-5 py-8 text-[var(--evoly-charbon)]">
      <div className="mx-auto grid min-w-0 max-w-6xl gap-5">
        <Link href="/admin" className="text-sm font-semibold underline underline-offset-4">
          ← Back-office
        </Link>
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl tracking-[-0.04em]">{org.name}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${org.status === "ACTIVE" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
          >
            {org.status}
          </span>
          {sheet.risks.map((r) => (
            <span key={r} className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning">
              {RISK[r]}
            </span>
          ))}
        </header>
        <p className="text-sm text-ink-muted">
          {org.slug} · {org.subdomain ?? "sans sous-domaine"} · {org.country} · créée le {formatDateTime(org.createdAt, org.timezone, "fr", "short")} ·{" "}
          {org._count.members} membre(s) · {org._count.events} événement(s)
        </p>
        <form action={supportViewAction.bind(null, org.id)}>
          <button type="submit" className="h-11 rounded-full bg-[var(--evoly-lilas)] px-5 text-sm font-semibold">
            Consulter l’app en lecture seule (journalisé)
          </button>
        </form>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Volumes">
          {[
            ["Commandes payées", String(sheet.sales.orders)],
            ["Ventes brutes", eur(sheet.sales.grossMinor)],
            ["Commissions", eur(sheet.sales.commissionMinor)],
            ["Remboursements", `${sheet.refunds.count} · ${eur(sheet.refunds.amountMinor)}`],
            ["Litiges (ouverts)", `${sheet.disputes.total} (${sheet.disputes.open})`],
            [
              "Offre",
              sub
                ? `${sub.planId} · ${sub.status}${sub.currentPeriodEnd ? ` · jusqu’au ${formatDateTime(sub.currentPeriodEnd, org.timezone, "fr", "short")}` : ""}`
                : "free",
            ],
            ["Stripe", org.stripeAccount ? `${org.stripeAccount.status} · ${org.stripeAccount.stripeAccountId}` : "non connecté"],
            ["Abonnement Stripe", sub?.stripeSubscriptionId ?? "aucun"],
          ].map(([k, v]) => (
            <div key={k} className={card}>
              <p className="text-xs font-bold text-ink-muted">{k}</p>
              <p className="break-words font-semibold">{v}</p>
            </div>
          ))}
        </section>
        {admin ? (
          <section className={`${card} grid gap-4`} aria-label="Actions">
            <h2 className="font-display text-lg">Actions</h2>
            {org.status === "ACTIVE" ? (
              <form action={suspendAction.bind(null, org.id)} className="flex flex-wrap gap-2">
                <input
                  name="reason"
                  required
                  minLength={5}
                  placeholder="Motif de la suspension (envoyé au propriétaire)"
                  aria-label="Motif de la suspension"
                  className={`${input} min-w-0 flex-1`}
                />
                <button type="submit" className="h-11 rounded-full bg-danger px-5 text-sm font-semibold text-blanc">
                  Suspendre l’organisation
                </button>
              </form>
            ) : (
              <form action={reactivateAction.bind(null, org.id)}>
                <button type="submit" className={btn}>
                  Réactiver l’organisation
                </button>
              </form>
            )}
            <form action={extendTrialAction.bind(null, org.id)} className="flex flex-wrap items-center gap-2">
              <input name="days" type="number" min={1} max={90} defaultValue={14} aria-label="Jours d’essai" className={`${input} w-24`} />
              <button type="submit" className={btn}>
                Prolonger l’essai Pro
              </button>
            </form>
            <form action={assignPlanAction.bind(null, org.id)} className="flex flex-wrap items-center gap-2">
              <select name="plan" aria-label="Offre attribuée" className={input}>
                <option value="pro">Pro</option>
                <option value="free">Free</option>
                <option value="partner">Partenaire (Pro offert, sans commission)</option>
              </select>
              <input name="until" type="date" aria-label="Jusqu’au" className={input} />
              <button type="submit" className={btn}>
                Attribuer l’offre
              </button>
            </form>
            <form action={resendOrderAction.bind(null, org.id)} className="flex flex-wrap items-center gap-2">
              <input name="orderId" placeholder="Identifiant de commande" aria-label="Identifiant de commande" className={`${input} min-w-0 flex-1`} />
              <button type="submit" className={btn}>
                Renvoyer les e-mails de la commande
              </button>
            </form>
            <form action={featureFlagAction.bind(null, org.id)} className="flex flex-wrap items-center gap-2">
              <input name="key" placeholder="clé de fonctionnalité" aria-label="Clé de fonctionnalité" className={input} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked className="size-5" /> activée
              </label>
              <button type="submit" className={btn}>
                Enregistrer
              </button>
            </form>
          </section>
        ) : null}
        {sheet.failedListings.length ? (
          <section className={`${card} grid gap-2`} aria-label="Reventes en échec">
            <h2 className="font-display text-lg">Reventes en échec</h2>
            {sheet.failedListings.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {l.event.title} · {l.linkCode} · {eur(l.priceMinor)} · {l.failureReason}
                </span>
                {admin ? (
                  <form action={retryResaleAction.bind(null, org.id, l.id)}>
                    <button type="submit" className={btn}>
                      Relancer le remboursement du vendeur
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className={`${card} grid content-start gap-2`}>
            <h2 className="font-display text-lg">Événements récents</h2>
            {sheet.events.map((e) => (
              <p key={e.id} className="text-sm">
                {e.title} · {formatDateTime(e.startsAt, org.timezone, "fr", "short")} · {e.status}
              </p>
            ))}
            <h2 className="mt-3 font-display text-lg">Fonctionnalités</h2>
            {org.featureFlags.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune.</p>
            ) : (
              org.featureFlags.map((f) => (
                <p key={f.id} className="text-sm font-mono">
                  {f.key} · {f.enabled ? "activée" : "désactivée"}
                </p>
              ))
            )}
          </div>
          <div className={`${card} grid content-start gap-1`}>
            <h2 className="font-display text-lg">Journal d’audit</h2>
            <ul className="grid max-h-[28rem] gap-1 overflow-y-auto text-xs">
              {sheet.auditLog.map((a) => (
                <li key={a.id} className="border-t border-line pt-1">
                  <span className="font-mono">{a.action}</span> · {a.actorType} · {formatDateTime(a.createdAt, org.timezone, "fr", "short")}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
