import { baseLocale } from "@evoly/i18n";
import { can, canOwnerOnly } from "@evoly/core";
import type { Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui/Card";
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
export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("settings");
  const ts = await getTranslations("orgSettings");
  const locale = (await getLocale()) as Locale;
  const [org, locked, currencies, url] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id } }),
    hasSales(ctx.organization.id),
    db.planCurrencyTerms.findMany({ where: { planId: "free" }, select: { currency: true } }),
    canonicalOrgUrl({ id: ctx.organization.id, subdomain: ctx.organization.subdomain, slug: ctx.organization.slug, features: ctx.features }),
  ]);
  const owner = canOwnerOnly(ctx.membership, "ORGANIZATION_DELETE");
  const blockers = owner ? await deletionBlockers(org.id) : [];
  const stripeTone = ctx.stripe?.status === "ACTIVE" ? "success" : ctx.stripe ? "warning" : "neutral";
  return (
    <div className="grid max-w-4xl gap-6">
      <h1 className="page-title">{t("title")}</h1>
      <Card className="grid gap-4">
        <OrganizationSettingsForm
          orgSlug={orgSlug}
          readOnly={!can(ctx.membership, "ORG_SETTINGS_EDIT") || ctx.readOnly}
          currencyLocked={locked}
          currencies={[...new Set(currencies.map((c) => c.currency))]}
          countries={LAUNCH_COUNTRIES.map((c) => ({ code: c.code, name: c.name[baseLocale(locale)] }))}
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
      </Card>
      <Link href={`/o/${orgSlug}/brand`} className="block rounded-lg">
        <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
          <div className="grid min-w-0 gap-1">
            <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{ts("pageAddress")}</h2>
            <p className="truncate font-mono text-sm text-ink-muted">{url.replace(/^https?:\/\//, "")}</p>
          </div>
          <span className="text-sm font-semibold underline underline-offset-4">{ts("changeAddress")}</span>
        </Card>
      </Link>
      <Link href={`/o/${orgSlug}/settings/payments`} className="block rounded-lg">
        <Card className="flex items-center justify-between gap-4 transition-shadow hover:shadow-md">
          <div className="grid gap-1">
            <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("payments")}</h2>
            <p className="text-sm text-ink-muted">{t("paymentsSummary")}</p>
          </div>
          <Badge tone={stripeTone}>{t(`stripeStatus_${ctx.stripe?.status ?? "NONE"}`)}</Badge>
        </Card>
      </Link>
      {owner ? (
        <Card className="grid gap-3 ring-1 ring-danger/40">
          <h2 className="font-display text-xl tracking-[var(--tracking-title)] text-danger">{ts("deleteTitle")}</h2>
          <p className="-mt-1 text-sm text-ink-muted">{ts("deleteIntro")}</p>
          <DeleteOrganization orgSlug={orgSlug} name={org.name} blockers={blockers} />
        </Card>
      ) : null}
    </div>
  );
}
