import { can, hasFeature } from "@evoly/core";
import { SettingsRow } from "@/components/ui/Controls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canonicalOrgUrl } from "@/server/canonical";
import { requireOrgContext } from "@/server/context";
import { featuredSettings } from "@/server/orgPage";
import { FeaturedForm } from "../settings/FeaturedForm";
import { listCustomDomains, MAX_CUSTOM_DOMAINS } from "@/server/domains";
import { AddDomain, BrandForm, DomainRow, SubdomainForm } from "./BrandClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("brand") };
}

/** Section 9.19 : adresse de la billetterie (toutes offres), marque et domaines personnalisés (Pro). */
export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgSlug } = await params;
  const asked = (await searchParams).tab;
  const tab =
    asked === "domains" ? "domains" : asked === "page" ? "page" : "brand";
  const ctx = await requireOrgContext(orgSlug);
  const canBrand = can(ctx.membership, "BRAND_EDIT");
  const canDomains = can(ctx.membership, "DOMAINS_MANAGE");
  const canAddress = can(ctx.membership, "ORG_SETTINGS_EDIT");
  if (!canBrand && !canDomains && !canAddress) notFound();
  const [brand, domains, events, url] = await Promise.all([
    db.organizationBrand.findUnique({
      where: { organizationId: ctx.organization.id },
    }),
    canDomains ? listCustomDomains(ctx) : Promise.resolve([]),
    db.event.findMany({
      where: {
        organizationId: ctx.organization.id,
        deletedAt: null,
        status: { notIn: ["ARCHIVED", "CANCELLED"] },
      },
      select: { id: true, title: true },
      orderBy: { startsAt: "desc" },
    }),
    canonicalOrgUrl({
      id: ctx.organization.id,
      subdomain: ctx.organization.subdomain,
      slug: ctx.organization.slug,
      features: ctx.features,
    }),
  ]);
  const t = await getTranslations("brand");
  const ts = await getTranslations("orgSettings");
  const featured = await featuredSettings(ctx);
  const pro = {
    brand: hasFeature(ctx.features, "BRANDING"),
    domains: hasFeature(ctx.features, "CUSTOM_DOMAINS"),
    hide: hasFeature(ctx.features, "REMOVE_EVOLY_BRANDING"),
  };
  const upsell = (text: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-accent px-4 py-3">
      <p className="text-sm">{text}</p>
      <Link
        href={`/o/${orgSlug}/billing`}
        className={buttonClass("dark", "sm")}
      >
        {t("upgrade")}
      </Link>
    </div>
  );
  return (
    // refonte A3 (maquette « Réglages de l'événement ») : des rangées, le titre et l'explication à gauche ; la marque, un
    // éditeur avec son aperçu, garde toute la largeur
    <div>
      {/* onglet « Domaines » : adresse de la billetterie et domaines personnalisés (seul onglet sans la marque) */}
      {canAddress && (tab === "domains" || (tab === "brand" && !canBrand)) ? (
        <SettingsRow
          title={t("addressTitle")}
          description={
            <>
              {t("addressIntro")}{" "}
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink underline underline-offset-4"
              >
                {url.replace(/^https?:\/\//, "")}
              </a>
            </>
          }
        >
          <SubdomainForm
            orgSlug={orgSlug}
            current={ctx.organization.subdomain ?? ""}
            baseDomain={env().NEXT_PUBLIC_BASE_DOMAIN}
          />
        </SettingsRow>
      ) : null}

      {canAddress && tab === "page" ? (
        <SettingsRow
          title={ts("featuredTitle")}
          description={ts("featuredHint")}
        >
          <FeaturedForm
            orgSlug={orgSlug}
            readOnly={!can(ctx.membership, "ORG_SETTINGS_EDIT") || ctx.readOnly}
            mode={featured.mode}
            eventId={featured.eventId}
            fallback={featured.fallback}
            events={featured.events.map((e) => ({
              id: e.id,
              title: e.title,
              startsAt: e.startsAt.toISOString(),
              timezone: e.timezone,
            }))}
          />
        </SettingsRow>
      ) : null}
      {canBrand && tab === "brand" ? (
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-[0.9375rem] font-semibold">
              {t("brandTitle")}
            </h2>
            <p className="text-sm text-ink-muted">{t("brandIntro")}</p>
          </div>
          {pro.brand ? (
            <BrandForm
              orgSlug={orgSlug}
              organizationName={ctx.organization.name}
              canHide={pro.hide}
              values={{
                displayName: brand?.displayName ?? "",
                logoUrl: brand?.logoUrl ?? "",
                faviconUrl: brand?.faviconUrl ?? "",
                primaryColor: brand?.primaryColor ?? "",
                accentColor: brand?.accentColor ?? "",
                emailFromName: brand?.emailFromName ?? "",
                emailReplyTo: brand?.emailReplyTo ?? "",
                hideEvolyBranding: brand?.hideEvolyBranding ?? true,
                backgroundColor: brand?.backgroundColor ?? "",
                radius: brand?.radius ?? "",
                headingFont: brand?.headingFont ?? "",
                bodyFont: brand?.bodyFont ?? "",
                buttonLabel: brand?.buttonLabel ?? "",
                socials: Object.fromEntries(
                  (
                    [
                      "website",
                      "instagram",
                      "facebook",
                      "tiktok",
                      "linkedin",
                      "youtube",
                    ] as const
                  ).map((k) => [
                    k,
                    ((brand?.socialLinks ?? {}) as Record<string, string>)[k] ??
                      "",
                  ]),
                ) as Record<
                  | "website"
                  | "instagram"
                  | "facebook"
                  | "tiktok"
                  | "linkedin"
                  | "youtube",
                  string
                >,
              }}
            />
          ) : (
            upsell(t("brandUpsell"))
          )}
        </Card>
      ) : null}

      {canDomains && (tab === "domains" || (tab === "brand" && !canBrand)) ? (
        <SettingsRow title={t("domainsTitle")} description={t("domainsIntro")}>
          {!pro.domains
            ? upsell(domains.length ? t("domainsDisabled") : t("domainsUpsell"))
            : null}
          {domains.map((d) => (
            <DomainRow
              key={d.id}
              orgSlug={orgSlug}
              planOk={pro.domains}
              d={{
                id: d.id,
                domain: d.domain,
                status: d.status,
                dnsTarget: d.dnsTarget,
                lastError: d.lastError,
                checksStopped: !!d.checksStoppedAt,
                target:
                  d.scope === "EVENT"
                    ? t("scopeEvent", { title: d.event?.title ?? "-" })
                    : t("scopeOrganization"),
              }}
            />
          ))}
          {pro.domains ? (
            domains.length < MAX_CUSTOM_DOMAINS ? (
              <div className="rounded-[10px] border border-line p-4">
                <AddDomain orgSlug={orgSlug} events={events} />
              </div>
            ) : (
              <p className="text-[13px] text-ink-muted">
                {t("domainsLimit", { max: MAX_CUSTOM_DOMAINS })}
              </p>
            )
          ) : null}
        </SettingsRow>
      ) : null}
    </div>
  );
}
