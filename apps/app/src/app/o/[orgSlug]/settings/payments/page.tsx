import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConnectMollie } from "@/app/onboarding/payments/ConnectMollie";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Banner } from "@/components/ui/Card";
import { SettingsRow } from "@/components/ui/Controls";
import { db } from "@/lib/db";
import { mollieConnectConfigured } from "@/lib/mollie";
import { safeError } from "@/lib/redact";
import {
  findOrgContext,
  requireOrgContext,
  type OrgContext,
} from "@/server/context";
import { syncMollieAccount } from "@/server/mollieConnect";
import { MollieDisconnect } from "./MollieDisconnect";
import { RefundDefault } from "./RefundDefault";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("payments") };
}

type MollieState =
  "none" | "disconnected" | "needsData" | "inReview" | "pending" | "ready";

function mollieState(m: OrgContext["mollie"]): MollieState {
  if (!m) return "none";
  if (m.disconnected) return "disconnected";
  if (m.ready) return "ready";
  if (m.onboardingStatus === "NEEDS_DATA") return "needsData";
  if (m.onboardingStatus === "IN_REVIEW") return "inReview";
  return "pending";
}
const MOLLIE_TONE = {
  none: "neutral",
  disconnected: "danger",
  needsData: "warning",
  inReview: "warning",
  pending: "warning",
  ready: "success",
} as const;
const STRIPE_TONE = (status: string) =>
  status === "ACTIVE"
    ? "success"
    : status === "PENDING"
      ? "warning"
      : ("danger" as const);

/** Relecture chez Mollie à l'ouverture de la page, au plus une fois par minute, tant que le compte n'est pas prêt. */
async function refreshMollie(ctx: OrgContext, orgSlug: string) {
  if (!ctx.mollie || ctx.mollie.ready || ctx.mollie.disconnected) return ctx;
  const account = await db.mollieAccount.findUnique({
    where: { organizationId: ctx.organization.id },
    select: { syncedAt: true },
  });
  if (account?.syncedAt && Date.now() - account.syncedAt.getTime() < 60_000)
    return ctx;
  try {
    await syncMollieAccount(ctx.organization.id);
    const fresh = await findOrgContext(ctx.user.id, orgSlug);
    return fresh ? { user: ctx.user, ...fresh } : ctx;
  } catch (e) {
    console.error("relecture du compte Mollie", safeError(e));
    return ctx;
  }
}

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ mollie?: string }>;
}) {
  const { orgSlug } = await params;
  const { mollie: result } = await searchParams;
  const ctx = await refreshMollie(await requireOrgContext(orgSlug), orgSlug);
  const t = await getTranslations("settings");
  const tm = await getTranslations("mollie");
  const tf = await getTranslations("formErrors");
  const manage = can(ctx.membership, "PAYMENTS_MANAGE") && !ctx.readOnly;
  const { refundFeeMode, phone } = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organization.id },
    select: { refundFeeMode: true, phone: true },
  });
  const state = mollieState(ctx.mollie);
  const methods = (ctx.mollie?.methods ?? []).map((id) =>
    tm.has(`method_${id}`) ? tm(`method_${id}`) : id,
  );
  const onboardingUrl = ctx.mollie?.onboardingUrl?.startsWith("https://")
    ? ctx.mollie.onboardingUrl
    : "https://my.mollie.com/dashboard";
  // refonte A3 (maquette « Réglages de l'événement ») : l'explication, puis une rangée par sujet
  return (
    <div className="grid gap-3.5">
      <p className="max-w-[720px] text-[13px] text-ink-muted">
        {t("paymentsIntro")}
      </p>
      {result === "connected" ? (
        <Banner tone="success" title={tm("result_connected")} />
      ) : result === "denied" ? (
        <Banner tone="info" title={tm("result_denied")} />
      ) : result ? (
        <Banner
          tone="danger"
          title={tf.has(result) ? tf(result) : tf("generic")}
        />
      ) : null}
      <div>
        <SettingsRow title="Mollie" description={tm(`explain_${state}`)}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={MOLLIE_TONE[state]} dot>
              {tm(`status_${state}`)}
            </Badge>
            {ctx.mollie?.testmode ? (
              <Badge tone="neutral">{tm("testmode")}</Badge>
            ) : null}
          </div>
          {ctx.mollie && !ctx.mollie.disconnected ? (
            <ul className="grid gap-1 text-[13px] text-ink-muted">
              <li>
                {methods.length > 0
                  ? tm("methods", { list: methods.join(", ") })
                  : tm("methodsNone")}
              </li>
              <li>
                {tm(
                  ctx.mollie.canReceiveSettlements
                    ? "settlementsOn"
                    : "settlementsOff",
                )}
              </li>
            </ul>
          ) : null}
          {!manage ? null : !mollieConnectConfigured() ? (
            <Banner tone="info" title={tm("notConfiguredTitle")}>
              {tm("notConfiguredBody")}
            </Banner>
          ) : state === "none" || state === "disconnected" ? (
            <ConnectMollie
              orgSlug={ctx.organization.slug}
              from="settings"
              phone={phone}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {state === "needsData" ? (
                <a
                  href={onboardingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("primary")}
                >
                  {tm("complete")}
                </a>
              ) : null}
              <a
                href="https://my.mollie.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary")}
              >
                {tm("open")}
              </a>
              <MollieDisconnect orgSlug={ctx.organization.slug} />
            </div>
          )}
        </SettingsRow>
        {/* compte Stripe d'avant le passage à Mollie : affiché tant qu'il existe, plus de nouvelle liaison */}
        {ctx.stripe ? (
          <SettingsRow
            title="Stripe"
            description={t(`stripeExplain_${ctx.stripe.status}`)}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={STRIPE_TONE(ctx.stripe.status)} dot>
                {t(`stripeStatus_${ctx.stripe.status}`)}
              </Badge>
              {manage ? (
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("secondary")}
                >
                  {t("openStripeDashboard")}
                </a>
              ) : null}
            </div>
          </SettingsRow>
        ) : null}
        {/* RG-REF-09 : remboursement demandé par l'acheteur, valeur proposée aux nouveaux événements */}
        <SettingsRow
          title={t("refundDefaultTitle")}
          description={t("refundDefaultDesc")}
        >
          <RefundDefault
            orgSlug={ctx.organization.slug}
            value={refundFeeMode}
            readOnly={!manage}
          />
        </SettingsRow>
        <SettingsRow title={t("feesTitle")}>
          <p className="text-ink-body">
            {t(
              ctx.plan === "partner"
                ? "feesBodyPartner"
                : ctx.plan === "pro"
                  ? "feesBodyPro"
                  : "feesBodyFree",
            )}
          </p>
        </SettingsRow>
      </div>
    </div>
  );
}
