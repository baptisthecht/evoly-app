import { can, hasFeature } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { ProLocked } from "@/components/ProLocked";
import { buttonClass } from "@/components/ui/Button";
import { SectionTitle, SettingsRow } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Field";
import { env } from "@/lib/env";
import { requireOrgContext } from "@/server/context";
import { listEmbedOrigins } from "@/server/embed";
import { getEventWithTickets } from "@/server/events";
import { eventVisits } from "@/server/eventOverview";
import { eventPublicUrl } from "@/server/urls";
import { EventAppearance } from "../settings/EventAppearance";
import { AddOriginForm, RemoveOrigin } from "./EmbedForms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabEmbed") };
}

/** Billetterie intégrable au site de l'organisateur (section 9.26, Pro) : sites autorisés et codes à copier. */
export default async function DiffusionPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("embed");
  // le lien et le sous-domaine de l'événement, pour tous ; l'intégration sur votre site, en Pro
  const editable =
    can(ctx.membership, "EVENTS_EDIT") &&
    !ctx.readOnly &&
    !["CANCELLED", "ENDED", "ARCHIVED"].includes(event.status);
  const saleUrl = eventPublicUrl(
    {
      subdomain: ctx.organization.subdomain ?? null,
      slug: ctx.organization.slug,
    },
    event,
  );
  const [visits, ov, tn] = await Promise.all([
    eventVisits(eventId),
    getTranslations("overview"),
    getTranslations("nav"),
  ]);
  // refonte A3 (maquette « Réglages de l'événement ») : une rangée par réglage, le titre et l'explication à gauche.
  // D'abord le lien à partager et ses visites (retirés de la vue d'ensemble, qui suit la maquette), puis le sous-domaine
  const share = (
    <SettingsRow title={t("linkTitle")} description={t("linkHint")}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <Input readOnly value={saleUrl} aria-label={t("linkTitle")} />
        </span>
        <CopyButton value={saleUrl} label={tn("copyLink")} size="md" />
      </div>
      <p className="text-[13px] text-ink-muted">
        {t("visitsLine", { views: visits.views })}
        {visits.conversionPct !== null
          ? `, ${ov("conversion", { pct: visits.conversionPct })}`
          : ""}
      </p>
    </SettingsRow>
  );
  const link = editable ? (
    <EventAppearance
      orgSlug={orgSlug}
      eventId={eventId}
      part="subdomain"
      cover={event.coverImageUrl}
      subdomain={event.subdomain}
      baseDomain={env().NEXT_PUBLIC_BASE_DOMAIN}
      canSubdomain={hasFeature(ctx.features, "EVENT_SUBDOMAINS")}
      protocol={new URL(env().NEXT_PUBLIC_APP_URL).protocol}
    />
  ) : null;
  const site = (
    <div className="pt-6 pb-1">
      <SectionTitle title={t("siteTitle")} />
      <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
    </div>
  );
  if (!hasFeature(ctx.features, "EMBED_WIDGET")) {
    return (
      <div>
        {share}
        {link}
        {site}
        <ProLocked
          orgSlug={orgSlug}
          feature="EMBED_WIDGET"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      </div>
    );
  }
  const origins = await listEmbedOrigins(ctx);
  const manage = can(ctx.membership, "MARKETING_MANAGE") && !ctx.readOnly;
  const app = env().NEXT_PUBLIC_APP_URL;
  const script = `<script src="${app}/embed.js" defer></script>`;
  const button = `${script}\n<a href="${saleUrl}" data-evoly-button>${t("bookLabel")}</a>`;
  const module = `${script}\n<div data-evoly-module="${event.id}"></div>`;
  const pre =
    "overflow-x-auto rounded-[8px] bg-surface-soft px-3 py-2.5 text-[12.5px] leading-[1.5] text-ink-body";
  return (
    <div>
      {share}
      {link}
      {site}
      <SettingsRow title={t("sitesTitle")} description={t("sitesHint")}>
        {origins.length ? (
          <ul role="list">
            {origins.map((o) => (
              <li
                key={o}
                className="flex items-center justify-between gap-3 border-b border-line py-1.5"
              >
                <span className="break-all">{o}</span>
                {manage ? (
                  <RemoveOrigin
                    orgSlug={orgSlug}
                    eventId={eventId}
                    origin={o}
                    label={t("remove")}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-muted">{t("noSites")}</p>
        )}
        {manage ? <AddOriginForm orgSlug={orgSlug} eventId={eventId} /> : null}
      </SettingsRow>
      {[
        { title: t("buttonTitle"), hint: t("buttonHint"), code: button },
        { title: t("moduleTitle"), hint: t("moduleHint"), code: module },
      ].map((b, i) => (
        <SettingsRow key={b.title} title={b.title} description={b.hint}>
          <pre className={pre}>
            <code>{b.code}</code>
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={b.code} label={t("copy")} size="md" />
            {i === 1 ? (
              <a
                href={`${app}/integre/${event.id}`}
                target="_blank"
                rel="noopener"
                className={buttonClass("ghost")}
              >
                {t("preview")}
              </a>
            ) : null}
          </div>
        </SettingsRow>
      ))}
      <SettingsRow title={t("eventsTitle")} description={t("eventsHint")}>
        <pre className={pre}>
          <code>{`<script>\n  window.addEventListener("evoly:order_completed", (e) => {\n    // e.detail : { tickets, amountMinor, currency }\n  });\n</script>`}</code>
        </pre>
      </SettingsRow>
    </div>
  );
}
