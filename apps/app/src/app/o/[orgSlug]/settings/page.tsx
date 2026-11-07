import { baseLocale } from "@evoly/i18n";
import { can, canOwnerOnly } from "@evoly/core";
import type { Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { SettingsRow } from "@/components/ui/Controls";
import { db } from "@/lib/db";
import { LAUNCH_COUNTRIES } from "@/lib/countries";
import { canonicalOrgUrl } from "@/server/canonical";
import { requireOrgContext } from "@/server/context";
import { deletionBlockers, hasSales } from "@/server/organization";
import { DeleteOrganization, OrganizationSettingsForm } from "./SettingsClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settings") };
}

/** Section 9.3 : page Paramètres, paiements, suppression de l'organisation. */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgSlug } = await params;
  const tab = (await searchParams).tab === "advanced" ? "advanced" : "general";
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("settings");
  const ts = await getTranslations("orgSettings");
  const locale = (await getLocale()) as Locale;
  const [org, locked, currencies, url] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id } }),
    hasSales(ctx.organization.id),
    db.planCurrencyTerms.findMany({
      where: { planId: "free" },
      select: { currency: true },
    }),
    canonicalOrgUrl({
      id: ctx.organization.id,
      subdomain: ctx.organization.subdomain,
      slug: ctx.organization.slug,
      features: ctx.features,
    }),
  ]);
  const owner = canOwnerOnly(ctx.membership, "ORGANIZATION_DELETE");
  const blockers = owner ? await deletionBlockers(org.id) : [];
  const stripeTone =
    ctx.stripe?.status === "ACTIVE"
      ? "success"
      : ctx.stripe
        ? "warning"
        : "neutral";
  // Avancé : supprimer l'organisation (le propriétaire seulement)
  // refonte A3 (maquette « Réglages de l'événement ») : des rangées, le titre et l'explication à gauche
  if (tab === "advanced")
    return owner ? (
      <div>
        <SettingsRow title={ts("deleteTitle")} description={ts("deleteIntro")}>
          <DeleteOrganization
            orgSlug={orgSlug}
            name={org.name}
            blockers={blockers}
          />
        </SettingsRow>
      </div>
    ) : (
      <p className="text-[13px] text-ink-muted">{ts("deleteOwnerOnly")}</p>
    );
  return (
    <div>
      <OrganizationSettingsForm
        orgSlug={orgSlug}
        readOnly={!can(ctx.membership, "ORG_SETTINGS_EDIT") || ctx.readOnly}
        currencyLocked={locked}
        currencies={[...new Set(currencies.map((c) => c.currency))]}
        countries={LAUNCH_COUNTRIES.map((c) => ({
          code: c.code,
          name: c.name[baseLocale(locale)],
        }))}
        values={{
          name: org.name,
          legalName: org.legalName ?? "",
          type: org.type,
          description: org.description ?? "",
          contactEmail: org.contactEmail ?? "",
          phone: org.phone ?? "",
          website: org.website ?? "",
          country: org.country,
          currency: org.currency,
          locale: org.locale,
          timezone: org.timezone,
          addressLine1: org.addressLine1 ?? "",
          addressLine2: org.addressLine2 ?? "",
          postalCode: org.postalCode ?? "",
          city: org.city ?? "",
          vatNumber: org.vatNumber ?? "",
          vatRegistered: org.vatRegistered,
        }}
      />
      <div className="mt-5 border-t border-line">
        <SettingsRow
          title={ts("pageAddress")}
          description={url.replace(/^https?:\/\//, "")}
        >
          <div>
            <ButtonLink href={`/o/${orgSlug}/brand`} variant="secondary">
              {ts("changeAddress")}
            </ButtonLink>
          </div>
        </SettingsRow>
        <SettingsRow title={t("payments")} description={t("paymentsSummary")}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={stripeTone} dot>
              {t(`stripeStatus_${ctx.stripe?.status ?? "NONE"}`)}
            </Badge>
            <ButtonLink
              href={`/o/${orgSlug}/settings/payments`}
              variant="secondary"
            >
              {t("payments")}
            </ButtonLink>
          </div>
        </SettingsRow>
      </div>
    </div>
  );
}
