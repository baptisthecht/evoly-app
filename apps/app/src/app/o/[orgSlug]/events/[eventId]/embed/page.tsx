import { can, hasFeature } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { ProLocked } from "@/components/ProLocked";
import { Card } from "@/components/ui/Card";
import { env } from "@/lib/env";
import { requireOrgContext } from "@/server/context";
import { listEmbedOrigins } from "@/server/embed";
import { getEventWithTickets } from "@/server/events";
import { eventPublicUrl } from "@/server/urls";
import { AddOriginForm, RemoveOrigin } from "./EmbedForms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabEmbed") };
}

/** Billetterie intégrable au site de l'organisateur (section 9.26, Pro) : sites autorisés et codes à copier. */
export default async function EmbedPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("embed");
  if (!hasFeature(ctx.features, "EMBED_WIDGET")) {
    return (
      <div className="grid gap-4">
        <p className="text-ink-muted">{t("intro")}</p>
        <ProLocked orgSlug={orgSlug} feature="EMBED_WIDGET" canUpgrade={can(ctx.membership, "BILLING_MANAGE")} />
      </div>
    );
  }
  const origins = await listEmbedOrigins(ctx);
  const manage = can(ctx.membership, "MARKETING_MANAGE") && !ctx.readOnly;
  const app = env().NEXT_PUBLIC_APP_URL;
  const saleUrl = eventPublicUrl({ subdomain: ctx.organization.subdomain ?? null, slug: ctx.organization.slug }, event);
  const script = `<script src="${app}/embed.js" defer></script>`;
  const button = `${script}\n<a href="${saleUrl}" data-evoly-button>${t("bookLabel")}</a>`;
  const module = `${script}\n<div data-evoly-module="${event.id}"></div>`;
  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">{t("intro")}</p>
      <Card className="grid gap-3">
        <h2 className="font-display text-xl">{t("sitesTitle")}</h2>
        {origins.length ? (
          <ul className="grid gap-1 text-sm">
            {origins.map((o) => (
              <li key={o} className="flex items-center justify-between gap-3">
                <code className="break-all">{o}</code>
                {manage ? <RemoveOrigin orgSlug={orgSlug} eventId={eventId} origin={o} label={t("remove")} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">{t("noSites")}</p>
        )}
        {manage ? <AddOriginForm orgSlug={orgSlug} eventId={eventId} /> : null}
      </Card>
      {[
        { title: t("buttonTitle"), hint: t("buttonHint"), code: button },
        { title: t("moduleTitle"), hint: t("moduleHint"), code: module },
      ].map((b) => (
        <Card key={b.title} className="grid gap-3">
          <h2 className="font-display text-xl">{b.title}</h2>
          <p className="text-sm text-ink-muted">{b.hint}</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-sunken p-3 text-xs">
            <code>{b.code}</code>
          </pre>
          <div>
            <CopyButton value={b.code} label={t("copy")} />
          </div>
        </Card>
      ))}
      <Card className="grid gap-3">
        <h2 className="font-display text-xl">{t("eventsTitle")}</h2>
        <p className="text-sm text-ink-muted">{t("eventsHint")}</p>
        <pre className="overflow-x-auto rounded-lg bg-surface-sunken p-3 text-xs">
          <code>{`<script>\n  window.addEventListener("evoly:order_completed", (e) => {\n    // e.detail : { tickets, amountMinor, currency }\n  });\n</script>`}</code>
        </pre>
      </Card>
      <a href={`${app}/integre/${event.id}`} target="_blank" rel="noopener" className="justify-self-start text-sm font-semibold underline underline-offset-4">
        {t("preview")}
      </a>
    </div>
  );
}
