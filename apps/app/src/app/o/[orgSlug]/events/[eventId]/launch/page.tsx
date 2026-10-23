import { notFound } from "next/navigation";
import { can, utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import { ProLocked } from "@/components/ProLocked";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { EventPublication } from "../settings/EventPublication";
import { formatDateTime, toLocale } from "@evoly/i18n";
import { getLocale } from "next-intl/server";
import { eventPublicUrl } from "@/server/urls";
import { waitingAlerts } from "@/server/alerts";
import { presaleOverview } from "@/server/presale";
import { EventPresale } from "../settings/EventPresale";
import { BotProtection } from "../settings/BotProtection";
import { hasFeature } from "@evoly/core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("launch") };
}

export default async function EventLaunchPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const local = (d: Date | null) => (d ? utcToZonedLocal(d, e.timezone) : "");
  const canPublish = can(ctx.membership, "EVENTS_PUBLISH");
  if (!canPublish) notFound();
  const waiting = await waitingAlerts(eventId);
  const presaleOn = hasFeature(ctx.features, "PRESALE_CODES");
  const presale = presaleOn ? await presaleOverview(eventId) : null;
  const tp = await getTranslations("publication");
  const when = e.publishAt
    ? formatDateTime(e.publishAt, e.timezone, toLocale(await getLocale()))
    : null;
  const publicationStatus =
    e.publishAt && when
      ? tp(e.publishAt > new Date() ? "statusScheduled" : "statusLive", {
          date: when,
        })
      : null;
  return (
    <div>
      {canPublish ? (
        <EventPublication
          orgSlug={orgSlug}
          eventId={eventId}
          timezone={e.timezone}
          publishLocal={e.publishAt ? local(e.publishAt) : null}
          mode={e.prePublishMode}
          teaserText={e.teaserText}
          previewUrl={
            e.previewToken
              ? `${eventPublicUrl(ctx.organization, e)}?apercu=${e.previewToken}`
              : null
          }
          status={publicationStatus}
          waiting={waiting}
          readOnly={
            ctx.readOnly ||
            ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status)
          }
        />
      ) : null}
      {canPublish ? (
        <BotProtection
          orgSlug={orgSlug}
          eventId={eventId}
          enabled={e.botProtection}
          readOnly={ctx.readOnly}
          labels={{
            title: tp("botTitle"),
            hint: tp("botHint"),
            saved: tp("botSaved"),
          }}
        />
      ) : null}
      {canPublish && presale ? (
        <EventPresale
          orgSlug={orgSlug}
          eventId={eventId}
          timezone={e.timezone}
          startsLocal={e.presaleStartsAt ? local(e.presaleStartsAt) : null}
          overview={presale}
          eventUrl={eventPublicUrl(ctx.organization, e)}
          csvUrl={`/o/${orgSlug}/events/${eventId}/presale.csv`}
          readOnly={
            ctx.readOnly ||
            ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status)
          }
        />
      ) : null}
      {canPublish && !presaleOn ? (
        <ProLocked
          orgSlug={orgSlug}
          feature="PRESALE_CODES"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      ) : null}
    </div>
  );
}
