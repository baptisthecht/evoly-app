import { can, hasFeature } from "@evoly/core";
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
import { listCustomDomains, MAX_CUSTOM_DOMAINS } from "@/server/domains";
import { AddDomain, BrandForm, DomainRow, SubdomainForm } from "./BrandClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("brand") };
}

/** Section 9.19 : adresse de la billetterie (toutes offres), marque et domaines personnalisés (Pro). */
export default async function BrandPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const canBrand = can(ctx.membership, "BRAND_EDIT");
  const canDomains = can(ctx.membership, "DOMAINS_MANAGE");
  const canAddress = can(ctx.membership, "ORG_SETTINGS_EDIT");
  if (!canBrand && !canDomains && !canAddress) notFound();
  const [brand, domains, events, url] = await Promise.all([
    db.organizationBrand.findUnique({ where: { organizationId: ctx.organization.id } }),
    canDomains ? listCustomDomains(ctx) : Promise.resolve([]),
    db.event.findMany({ where: { organizationId: ctx.organization.id, deletedAt: null, status: { notIn: ["ARCHIVED", "CANCELLED"] } }, select: { id: true, title: true }, orderBy: { startsAt: "desc" } }),
    canonicalOrgUrl({ id: ctx.organization.id, subdomain: ctx.organization.subdomain, slug: ctx.organization.slug, features: ctx.features }),
  ]);
  const t = await getTranslations("brand");
  const pro = { brand: hasFeature(ctx.features, "BRANDING"), domains: hasFeature(ctx.features, "CUSTOM_DOMAINS"), hide: hasFeature(ctx.features, "REMOVE_EVOLY_BRANDING") };
  const upsell = (text: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-accent px-4 py-3">
      <p className="text-sm">{text}</p>
      <Link href={`/o/${orgSlug}/billing`} className={buttonClass("dark", "sm")}>
        {t("upgrade")}
      </Link>
    </div>
  );
  return (
    <div className="grid max-w-5xl gap-6">
      <h1 className="page-title">{t("title")}</h1>

      {canAddress ? (
        <Card className="grid gap-3">
          <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("addressTitle")}</h2>
          <p className="text-sm text-ink-muted">
            {t("addressIntro")}{" "}
            <a href={url} target="_blank" rel="noreferrer" className="font-mono font-semibold text-ink underline underline-offset-4">
              {url.replace(/^https?:\/\//, "")}
            </a>
          </p>
          <SubdomainForm orgSlug={orgSlug} current={ctx.organization.subdomain ?? ""} baseDomain={env().NEXT_PUBLIC_BASE_DOMAIN} />
        </Card>
      ) : null}

      {canBrand ? (
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("brandTitle")}</h2>
            <p className="text-sm text-ink-muted">{t("brandIntro")}</p>
          </div>
          {pro.brand ? (
            <BrandForm
              orgSlug={orgSlug}
              organizationName={ctx.organization.name}
              canHide={pro.hide}
              values={{ displayName: brand?.displayName ?? "", logoUrl: brand?.logoUrl ?? "", faviconUrl: brand?.faviconUrl ?? "", primaryColor: brand?.primaryColor ?? "", accentColor: brand?.accentColor ?? "", emailFromName: brand?.emailFromName ?? "", emailReplyTo: brand?.emailReplyTo ?? "", hideEvolyBranding: brand?.hideEvolyBranding ?? true }}
            />
          ) : (
            upsell(t("brandUpsell"))
          )}
        </Card>
      ) : null}

      {canDomains ? (
        <section className="grid gap-3" aria-labelledby="domains-title">
          <h2 id="domains-title" className="font-display text-xl tracking-[var(--tracking-title)]">
            {t("domainsTitle")}
          </h2>
          <p className="-mt-1 text-sm text-ink-muted">{t("domainsIntro")}</p>
          {!pro.domains ? upsell(domains.length ? t("domainsDisabled") : t("domainsUpsell")) : null}
          {domains.map((d) => (
            <DomainRow
              key={d.id}
              orgSlug={orgSlug}
              planOk={pro.domains}
              d={{ id: d.id, domain: d.domain, status: d.status, dnsTarget: d.dnsTarget, lastError: d.lastError, checksStopped: !!d.checksStoppedAt, target: d.scope === "EVENT" ? t("scopeEvent", { title: d.event?.title ?? "-" }) : t("scopeOrganization") }}
            />
          ))}
          {pro.domains ? domains.length < MAX_CUSTOM_DOMAINS ? <Card><AddDomain orgSlug={orgSlug} events={events} /></Card> : <p className="text-sm text-ink-muted">{t("domainsLimit", { max: MAX_CUSTOM_DOMAINS })}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
