import { can, firstPeriodStart, type PlanFeature } from "@evoly/core";
import { formatDate, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui/Card";
import { billingState } from "@/server/billing";
import { requireOrgContext } from "@/server/context";
import { proPaymentReturn } from "@/server/proBilling";
import {
  CancelSubscription,
  ChangePaymentMethod,
  ResumeSubscription,
  SettleNow,
} from "./SubscriptionControls";
import { CompareOffers } from "./CompareOffers";
import { referralLink } from "@/server/referrals";
import { ReferralCard } from "./ReferralCard";
import { VenueCard } from "./VenueCard";
import { referringVenueName, venueSummary } from "@/server/venues";
import { getPlans } from "@/server/plans";
import { ManageSubscription, PlanPicker } from "./PlanPicker";
import { SwitchInterval } from "./SwitchInterval";
import { CheckIcon } from "@/components/ui/icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("billing") };
}

const COMPARED: PlanFeature[] = [
  "DYNAMIC_PRICING",
  "BRANDING",
  "REMOVE_EVOLY_BRANDING",
  "TEAM_MEMBERS",
  "CUSTOM_ROLES",
  "MULTI_ORGANIZATIONS",
  "EMAIL_MARKETING",
  "CUSTOM_DOMAINS",
  "EVENT_SUBDOMAINS",
];

/** Section 9.21 : offre actuelle, statut, essai, portail client, rappel des effets d'un retour en Free. */
export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    checkout?: string;
    tab?: string;
    mollie?: string;
    essai?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const { checkout, tab, mollie: returned, essai } = await searchParams;
  const view =
    tab === "referral" ? "referral" : tab === "venue" ? "venue" : "offer";
  const ctx = await requireOrgContext(orgSlug);
  // retour de la page de paiement de Mollie (docs/MOLLIE.md, lot 6) : le paiement est relu avant d'afficher l'offre
  const back =
    returned && can(ctx.membership, "BILLING_MANAGE")
      ? await proPaymentReturn(ctx, returned)
      : null;
  const [state, plans] = await Promise.all([billingState(ctx), getPlans()]);
  const t = await getTranslations("billing");
  const locale = (await getLocale()) as Locale;
  const tz = ctx.organization.timezone;
  const money = (v: number) =>
    formatMoney(v, state.currency, locale, { trimZeroCents: true });
  const sub = state.sub;
  const manage = can(ctx.membership, "BILLING_MANAGE");
  const referredBy = await referringVenueName(ctx.organization.id); // US-LIEU-03
  const tv = await getTranslations("venue");
  const isPro = state.plan === "pro";
  const isPartner = state.plan === "partner"; // offre Partenaire, attribuée par Evoly
  const status =
    !sub || !isPro
      ? "FREE"
      : sub.cancelAtPeriodEnd || sub.status === "CANCELED"
        ? "ENDING"
        : sub.status;
  const mollie = state.provider === "MOLLIE";
  // Pro sans abonnement payé : essai sans carte, ou Pro offert par Evoly (daté ou sans fin)
  const unpaidPro =
    isPro && !!sub && !sub.stripeSubscriptionId && !state.mollieBilled;
  const upcoming = sub?.nextInterval ?? sub?.interval ?? "MONTH";
  const statusLine =
    status === "TRIALING" && unpaidPro && sub?.trialEndsAt
      ? t("statusTrialNoCard", {
          date: formatDate(sub.trialEndsAt, tz, locale),
        })
      : status === "TRIALING" && sub?.trialEndsAt
        ? t("statusTrial", {
            date: formatDate(sub.trialEndsAt, tz, locale),
            price: money(state.prices[sub.interval ?? "MONTH"]),
            interval: t(`per_${sub.interval ?? "MONTH"}`),
          })
        : status === "ACTIVE" && unpaidPro
          ? sub?.currentPeriodEnd
            ? t("statusGranted", {
                date: formatDate(sub.currentPeriodEnd, tz, locale),
              })
            : t("statusGrantedUnlimited")
          : status === "ACTIVE" && sub?.currentPeriodEnd
            ? t("statusActive", {
                date: formatDate(sub.currentPeriodEnd, tz, locale),
                price: money(state.prices[upcoming]),
                interval: t(`per_${upcoming}`),
              })
            : (status === "PAST_DUE" || status === "UNPAID") &&
                state.daysBeforeDowngrade != null
              ? t("statusPastDue", { count: state.daysBeforeDowngrade })
              : status === "ENDING" && sub?.currentPeriodEnd
                ? t("statusEnding", {
                    date: formatDate(sub.currentPeriodEnd, tz, locale),
                  })
                : t("statusFree", { cap: money(state.caps.free) });
  const fmt = (d: Date) => formatDate(d, tz, locale);
  const now = new Date();
  const downgradeInfo = (
    <div className="rounded-md bg-surface-sunken p-4 text-sm">
      <p className="font-semibold">{t("downgradeTitle")}</p>
      <ul className="mt-2 grid list-disc gap-1 pl-5">
        {(["fee", "brand", "tiers", "members", "orgs"] as const).map((k) => (
          <li key={k}>
            {t(`downgrade_${k}`, { cap: money(state.caps.free) })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-ink-muted">{t("downgradeKept")}</p>
    </div>
  );
  // première période payée : à la fin de ce qui court encore (essai, Pro offert, ancien abonnement Stripe)
  const startsAt = firstPeriodStart(sub, now);
  const current = sub?.interval ?? "MONTH";
  // offre Pro payée par Mollie (docs/MOLLIE.md, lot 6)
  const mollieOffer =
    state.mollieBilled &&
    sub?.currentPeriodEnd &&
    (sub.status === "ACTIVE" || sub.status === "PAST_DUE") ? (
      <div className="grid gap-4">
        <p className="text-sm text-ink-muted">
          {sub.paymentMethodLabel
            ? t("paymentMethod", { label: sub.paymentMethodLabel })
            : t("paymentMethodSaved")}
        </p>
        {sub.status === "PAST_DUE" ? (
          <>
            {state.nextAttempt ? (
              <p className="text-sm">
                {t("nextAttempt", { date: fmt(state.nextAttempt) })}
              </p>
            ) : null}
            {state.paymentInProgress ? (
              <p className="text-sm text-ink-muted">{t("paymentInProgress")}</p>
            ) : (
              <SettleNow
                orgSlug={orgSlug}
                interval={current}
                label={t("settle", { price: money(state.prices[current]) })}
              />
            )}
          </>
        ) : sub.cancelAtPeriodEnd ? (
          <ResumeSubscription orgSlug={orgSlug} />
        ) : (
          <>
            {sub.nextInterval ? (
              <p className="text-sm">
                {t("nextIntervalPending", {
                  interval: sub.nextInterval,
                  price: money(state.prices[sub.nextInterval]),
                })}
              </p>
            ) : null}
            {state.renewalPending ? (
              <p className="text-sm text-ink-muted">
                {t("renewalPending", { price: money(state.prices[current]) })}
              </p>
            ) : null}
            <SwitchInterval
              orgSlug={orgSlug}
              target={
                sub.nextInterval
                  ? current
                  : current === "YEAR"
                    ? "MONTH"
                    : "YEAR"
              }
              label={
                sub.nextInterval
                  ? t(`keepInterval_${current}`)
                  : current === "YEAR"
                    ? t("switchToMonth", { price: money(state.prices.MONTH) })
                    : t("switchToYear", { price: money(state.prices.YEAR) })
              }
              done={t("switchScheduled", { date: fmt(sub.currentPeriodEnd) })}
              error={t("switchError")}
            />
            <ChangePaymentMethod orgSlug={orgSlug} />
            <CancelSubscription
              orgSlug={orgSlug}
              until={fmt(sub.currentPeriodEnd)}
            />
            {downgradeInfo}
          </>
        )}
      </div>
    ) : unpaidPro &&
      sub?.status === "ACTIVE" &&
      !sub.currentPeriodEnd ? null : (
      <div className="grid gap-4">
        {state.legacyStripe && sub ? (
          <p className="rounded-[10px] bg-surface-sunken px-3.5 py-3 text-sm">
            {t("legacyStripe", {
              date: fmt(sub.currentPeriodEnd ?? sub.trialEndsAt ?? now),
            })}
          </p>
        ) : null}
        {state.legacyStripe && state.stripeReady ? (
          <ManageSubscription orgSlug={orgSlug} />
        ) : null}
        <PlanPicker
          orgSlug={orgSlug}
          prices={state.prices}
          currency={state.currency}
          trial={state.trialEligible && !isPro}
          provider="MOLLIE"
          startsOn={
            startsAt.getTime() > now.getTime() + 60_000 ? fmt(startsAt) : null
          }
          cta={isPro ? t("subscribe") : t("upgrade")}
        />
      </div>
    );
  return (
    <div className="grid gap-6">
      {checkout === "success" ? (
        <p
          className="rounded-[10px] bg-success-soft px-3.5 py-3 text-success"
          role="status"
        >
          {t("checkoutSuccess")}
        </p>
      ) : null}
      {checkout === "cancel" ? (
        <p
          className="rounded-[10px] bg-surface-sunken px-3.5 py-3"
          role="status"
        >
          {t("checkoutCancel")}
        </p>
      ) : null}
      {essai === "ok" ? (
        <p
          className="rounded-[10px] bg-success-soft px-3.5 py-3 text-success"
          role="status"
        >
          {t("trialStarted")}
        </p>
      ) : null}
      {back ? (
        <p
          className={
            back.status === "PAID"
              ? "rounded-[10px] bg-success-soft px-3.5 py-3 text-success"
              : "rounded-[10px] bg-surface-sunken px-3.5 py-3"
          }
          role="status"
        >
          {back.status === "PAID"
            ? t(
                back.kind === "MANDATE"
                  ? "returnMandate"
                  : back.kind === "SETTLE"
                    ? "returnSettled"
                    : "returnPaid",
              )
            : back.status === "PENDING"
              ? t("returnPending")
              : t("returnFailed")}
        </p>
      ) : null}
      {ctx.readOnly ? (
        <p className="rounded-[10px] bg-warning-soft px-3.5 py-3 text-warning">
          {t("readOnlyNotice")}
        </p>
      ) : null}

      {view === "offer" ? (
        <>
          <Card className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* refonte A3 : le nom de l'offre comme un titre de fiche (21 px demi-gras) */}
              <h2 className="text-[21px] leading-[1.25] font-semibold tracking-[-0.01em]">
                {isPartner ? t("planPartner") : isPro ? "Pro" : "Free"}
              </h2>
              {isPartner ? (
                <Badge tone="success" dot>
                  {t("badge_PARTNER")}
                </Badge>
              ) : null}
              {isPartner ? null : (
                <Badge
                  tone={
                    status === "FREE"
                      ? "neutral"
                      : status === "PAST_DUE" || status === "UNPAID"
                        ? "danger"
                        : status === "ENDING"
                          ? "warning"
                          : "success"
                  }
                >
                  {t(`badge_${status}`)}
                </Badge>
              )}
            </div>
            <p>
              {isPartner
                ? `${t("partnerBody")}${sub?.currentPeriodEnd ? ` ${t("partnerUntil", { date: formatDate(sub.currentPeriodEnd, tz, locale) })}` : ""}`
                : statusLine}
            </p>
            {isPartner ? null : manage && mollie ? (
              mollieOffer
            ) : manage ? (
              isPro && sub?.stripeCustomerId ? (
                <div className="grid gap-4">
                  <ManageSubscription orgSlug={orgSlug} />
                  {sub.status === "TRIALING" || sub.status === "ACTIVE" ? (
                    <SwitchInterval
                      orgSlug={orgSlug}
                      target={sub.interval === "YEAR" ? "MONTH" : "YEAR"}
                      label={
                        sub.interval === "YEAR"
                          ? t("switchToMonth", {
                              price: money(state.prices.MONTH),
                            })
                          : t("switchToYear", {
                              price: money(state.prices.YEAR),
                            })
                      }
                      done={t("switchDone")}
                      error={t("switchError")}
                    />
                  ) : null}
                  {downgradeInfo}
                </div>
              ) : (
                <PlanPicker
                  orgSlug={orgSlug}
                  prices={state.prices}
                  currency={state.currency}
                  trial={state.trialEligible}
                  provider={state.provider}
                />
              )
            ) : (
              <p className="text-sm text-ink-muted">{t("ownerOnly")}</p>
            )}
          </Card>

          {state.invoices.length > 0 &&
          (manage || can(ctx.membership, "FINANCE_VIEW")) ? (
            <Card className="grid gap-3">
              <h2 className="text-[0.9375rem] font-semibold">
                {t("invoices")}
              </h2>
              <ul className="grid gap-2 text-sm">
                {state.invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-2 first:border-t-0 first:pt-0"
                  >
                    <span className="font-figures tabular-nums">
                      {inv.number}
                    </span>
                    <span className="text-ink-muted">{fmt(inv.issuedAt)}</span>
                    <span className="font-figures tabular-nums">
                      {formatMoney(inv.totalMinor, inv.currency, locale)}
                    </span>
                    <a
                      href={`/o/${orgSlug}/billing/invoices/${inv.id}`}
                      className="font-semibold underline underline-offset-2"
                      aria-label={t("invoiceDownload", { number: inv.number })}
                    >
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <CompareOffers label={t("compareOpen")} title={t("compareTitle")}>
            <Card className="grid gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm [&_td]:px-1 [&_th]:pr-2">
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th
                        scope="col"
                        className="pb-2 font-label text-xs font-bold"
                      >
                        <span className="sr-only">{t("feature")}</span>
                      </th>
                      <th
                        scope="col"
                        className="pb-2 text-center font-label text-xs font-bold"
                      >
                        Free
                      </th>
                      <th
                        scope="col"
                        className="pb-2 text-center font-label text-xs font-bold"
                      >
                        Pro
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-line">
                      <th scope="row" className="py-2 text-left font-normal">
                        {t("row_price")}
                      </th>
                      <td className="py-2 text-center">{money(0)}</td>
                      <td className="py-2 text-center">
                        {t("proPrice", {
                          month: money(state.prices.MONTH),
                          year: money(state.prices.YEAR),
                        })}
                      </td>
                    </tr>
                    <tr className="border-t border-line">
                      <th scope="row" className="py-2 text-left font-normal">
                        {t("row_fee")}
                      </th>
                      <td className="py-2 text-center">
                        {t("feeCap", { cap: money(state.caps.free) })}
                      </td>
                      <td className="py-2 text-center font-semibold">
                        {t("feeCap", { cap: money(state.caps.pro) })}
                      </td>
                    </tr>
                    {COMPARED.map((f) => (
                      <tr key={f} className="border-t border-line">
                        <th scope="row" className="py-2 text-left font-normal">
                          {t(`feature_${f}`)}
                        </th>
                        {(["free", "pro"] as const).map((p) => (
                          <td
                            key={p}
                            className="py-2 text-center"
                            aria-label={
                              plans[p].features.includes(f)
                                ? t("included")
                                : t("notIncluded")
                            }
                          >
                            {plans[p].features.includes(f) ? (
                              <CheckIcon className="mx-auto text-success" />
                            ) : (
                              <span aria-hidden="true">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-muted">{t("pricesTtc")}</p>
            </Card>
          </CompareOffers>
        </>
      ) : null}
      {view === "referral" && can(ctx.membership, "BILLING_MANAGE") ? (
        <ReferralCard {...await referralLink(ctx.organization.id)} />
      ) : null}
      {view === "venue" && can(ctx.membership, "BILLING_MANAGE") ? (
        <VenueCard
          orgSlug={orgSlug}
          currency={ctx.organization.currency}
          venue={await venueSummary(ctx)}
          manage={manage}
        />
      ) : null}
      {view === "venue" && referredBy ? (
        <Card className="grid gap-2">
          <h2 className="text-[0.9375rem] font-semibold">
            {tv("referredTitle")}
          </h2>
          <p className="text-sm text-ink-muted">
            {tv("referredBody", { name: referredBy })}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
