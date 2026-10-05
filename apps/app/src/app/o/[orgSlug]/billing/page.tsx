import { can, type PlanFeature } from "@evoly/core";
import { formatDate, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui/Card";
import { billingState } from "@/server/billing";
import { requireOrgContext } from "@/server/context";
import { referralLink } from "@/server/referrals";
import { ReferralCard } from "./ReferralCard";
import { getPlans } from "@/server/plans";
import { ManageSubscription, PlanPicker } from "./PlanPicker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("billing") };
}

const COMPARED: PlanFeature[] = ["DYNAMIC_PRICING", "BRANDING", "REMOVE_EVOLY_BRANDING", "TEAM_MEMBERS", "CUSTOM_ROLES", "MULTI_ORGANIZATIONS", "EMAIL_MARKETING", "CUSTOM_DOMAINS", "EVENT_SUBDOMAINS"];

/** Section 9.21 : offre actuelle, statut, essai, portail client, rappel des effets d'un retour en Free. */
export default async function BillingPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { orgSlug } = await params;
  const { checkout } = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  const [state, plans] = await Promise.all([billingState(ctx), getPlans()]);
  const t = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const tz = ctx.organization.timezone;
  const money = (v: number) => formatMoney(v, state.currency, locale, { trimZeroCents: true });
  const sub = state.sub;
  const manage = can(ctx.membership, "BILLING_MANAGE");
  const isPro = state.plan === "pro";
  const status = !sub || !isPro ? "FREE" : sub.cancelAtPeriodEnd || sub.status === "CANCELED" ? "ENDING" : sub.status;
  const statusLine =
    status === "TRIALING" && sub?.trialEndsAt
      ? t("statusTrial", { date: formatDate(sub.trialEndsAt, tz, locale), price: money(state.prices[sub.interval ?? "MONTH"]), interval: t(`per_${sub.interval ?? "MONTH"}`) })
      : status === "ACTIVE" && sub?.currentPeriodEnd
        ? t("statusActive", { date: formatDate(sub.currentPeriodEnd, tz, locale), price: money(state.prices[sub.interval ?? "MONTH"]), interval: t(`per_${sub.interval ?? "MONTH"}`) })
        : (status === "PAST_DUE" || status === "UNPAID") && state.daysBeforeDowngrade != null
          ? t("statusPastDue", { count: state.daysBeforeDowngrade })
          : status === "ENDING" && sub?.currentPeriodEnd
            ? t("statusEnding", { date: formatDate(sub.currentPeriodEnd, tz, locale) })
            : t("statusFree", { cap: money(state.caps.free) });
  return (
    <div className="grid max-w-4xl gap-6">
      <h1 className="page-title">{t("title")}</h1>
      {checkout === "success" ? <p className="rounded-lg bg-success-soft px-5 py-4 text-success" role="status">{t("checkoutSuccess")}</p> : null}
      {checkout === "cancel" ? <p className="rounded-lg bg-surface-sunken px-5 py-4" role="status">{t("checkoutCancel")}</p> : null}
      {ctx.readOnly ? <p className="rounded-lg bg-warning-soft px-5 py-4 text-warning">{t("readOnlyNotice")}</p> : null}

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-3xl tracking-[-0.04em]">{isPro ? "Pro" : "Free"}</h2>
          <Badge tone={status === "FREE" ? "neutral" : status === "PAST_DUE" || status === "UNPAID" ? "danger" : status === "ENDING" ? "warning" : "success"}>{t(`badge_${status}`)}</Badge>
        </div>
        <p>{statusLine}</p>
        {manage ? (
          isPro && sub?.stripeCustomerId ? (
            <div className="grid gap-4">
              <ManageSubscription orgSlug={orgSlug} />
              <div className="rounded-md bg-surface-sunken p-4 text-sm">
                <p className="font-semibold">{t("downgradeTitle")}</p>
                <ul className="mt-2 grid list-disc gap-1 pl-5">
                  {(["fee", "brand", "tiers", "members", "orgs"] as const).map((k) => (
                    <li key={k}>{t(`downgrade_${k}`, { cap: money(state.caps.free) })}</li>
                  ))}
                </ul>
                <p className="mt-2 text-ink-muted">{t("downgradeKept")}</p>
              </div>
            </div>
          ) : (
            <PlanPicker orgSlug={orgSlug} prices={state.prices} currency={state.currency} trial={state.trialEligible} />
          )
        ) : (
          <p className="text-sm text-ink-muted">{t("ownerOnly")}</p>
        )}
      </Card>

      <Card className="grid gap-3">
        <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("compareTitle")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_td]:px-1 [&_th]:pr-2">
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col" className="pb-2 font-label text-xs font-bold">
                  <span className="sr-only">{t("feature")}</span>
                </th>
                <th scope="col" className="pb-2 text-center font-label text-xs font-bold">Free</th>
                <th scope="col" className="pb-2 text-center font-label text-xs font-bold">Pro</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <th scope="row" className="py-2 text-left font-normal">
                  {t("row_price")}
                </th>
                <td className="py-2 text-center">{money(0)}</td>
                <td className="py-2 text-center">{t("proPrice", { month: money(state.prices.MONTH), year: money(state.prices.YEAR) })}</td>
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="py-2 text-left font-normal">
                  {t("row_fee")}
                </th>
                <td className="py-2 text-center">{t("feeCap", { cap: money(state.caps.free) })}</td>
                <td className="py-2 text-center font-semibold">{t("feeCap", { cap: money(state.caps.pro) })}</td>
              </tr>
              {COMPARED.map((f) => (
                <tr key={f} className="border-t border-line">
                  <th scope="row" className="py-2 text-left font-normal">
                    {t(`feature_${f}`)}
                  </th>
                  {(["free", "pro"] as const).map((p) => (
                    <td key={p} className="py-2 text-center" aria-label={plans[p].features.includes(f) ? t("included") : t("notIncluded")}>
                      {plans[p].features.includes(f) ? "✓" : "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-muted">{t("pricesTtc")}</p>
      </Card>
      {can(ctx.membership, "BILLING_MANAGE") ? <ReferralCard {...(await referralLink(ctx.organization.id))} /> : null}
    </div>
  );
}
