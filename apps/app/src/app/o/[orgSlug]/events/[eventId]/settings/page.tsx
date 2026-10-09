import { can, utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import { ProLocked } from "@/components/ProLocked";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { SettingsForm } from "./SettingsForm";
import { EventPublication } from "./EventPublication";
import { formatDateTime, toLocale } from "@evoly/i18n";
import { getLocale } from "next-intl/server";
import { eventPublicUrl } from "@/server/urls";
import { waitingAlerts } from "@/server/alerts";
import { EventAppearance } from "./EventAppearance";
import { EventReminders } from "./EventReminders";
import { eventEmailBlocks } from "@/server/eventEmailBlocks";
import { EventEmailBlocks } from "./EventEmailBlocks";
import { EventMarketingEmails } from "./EventMarketingEmails";
import { eventMarketingAutomations, eventReminders, automationDoc } from "@/server/automations";
import { hasFeature } from "@evoly/core";
import { env } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabSettings") };
}

export default async function EventSettingsPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const local = (d: Date | null) => (d ? utcToZonedLocal(d, e.timezone) : "");
  const readOnly = !can(ctx.membership, "EVENTS_EDIT") || ctx.readOnly || ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status);
  const emailBlocks = await eventEmailBlocks(eventId);
  const canPublish = can(ctx.membership, "EVENTS_PUBLISH");
  const waiting = canPublish ? await waitingAlerts(eventId) : 0;
  const tp = await getTranslations("publication");
  const when = e.publishAt ? formatDateTime(e.publishAt, e.timezone, toLocale(await getLocale())) : null;
  const publicationStatus = e.publishAt && when ? tp(e.publishAt > new Date() ? "statusScheduled" : "statusLive", { date: when }) : null;
  return (
    <div className="max-w-3xl">
      <SettingsForm
        orgSlug={orgSlug}
        eventId={eventId}
        readOnly={readOnly}
        values={{
          title: e.title,
          summary: e.summary ?? "",
          startsAtLocal: local(e.startsAt),
          endsAtLocal: local(e.endsAt),
          timezone: e.timezone,
          locationType: e.locationType,
          locationName: e.locationName ?? "",
          addressLine1: e.addressLine1 ?? "",
          postalCode: e.postalCode ?? "",
          city: e.city ?? "",
          country: e.country ?? ctx.organization.country,
          onlineUrl: e.onlineUrl ?? "",
          capacity: e.capacity != null ? String(e.capacity) : "",
          maxTicketsPerOrder: e.maxTicketsPerOrder,
          maxTicketsPerBuyer: e.maxTicketsPerBuyer,
          version: e.updatedAt.toISOString(),
          visibility: e.visibility as "PUBLIC",
          hasAccessCode: !!e.accessCodeHash,
          refundPolicy: e.refundPolicy,
          refundDeadlineLocal: local(e.refundDeadlineAt),
          salesStartLocal: local(e.salesStartAt),
          salesEndLocal: local(e.salesEndAt),
          resaleEnabled: e.resaleEnabled,
          resaleCutoffHours: e.resaleCutoffMinutes / 60,
          showResaleSection: e.showResaleSection,
        }}
      />
      {canPublish ? (
        <EventPublication
          orgSlug={orgSlug}
          eventId={eventId}
          timezone={e.timezone}
          publishLocal={e.publishAt ? local(e.publishAt) : null}
          mode={e.prePublishMode}
          teaserText={e.teaserText}
          previewUrl={e.previewToken ? `${eventPublicUrl(ctx.organization, e)}?apercu=${e.previewToken}` : null}
          status={publicationStatus}
          waiting={waiting}
          readOnly={ctx.readOnly || ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status)}
        />
      ) : null}
      {!readOnly ? <EventEmailBlocks orgSlug={orgSlug} eventId={eventId} ticket={emailBlocks.ticket} reminder={emailBlocks.reminder} /> : null}
      {!readOnly && can(ctx.membership, "MARKETING_MANAGE") ? (
        <EventReminders
          orgSlug={orgSlug}
          eventId={eventId}
          pro={hasFeature(ctx.features, "EMAIL_MARKETING")}
          reminders={
            hasFeature(ctx.features, "EMAIL_MARKETING")
              ? (await eventReminders(eventId)).map((r) => ({
                  type: r.type as "REMINDER_J7",
                  enabled: r.enabled,
                  lastRunAt: r.lastRunAt?.toISOString() ?? null,
                }))
              : []
          }
        />
      ) : null}
      {!readOnly && can(ctx.membership, "MARKETING_MANAGE") ? (
        hasFeature(ctx.features, "EMAIL_MARKETING") ? (
          <EventMarketingEmails
            orgSlug={orgSlug}
            eventId={eventId}
            automations={(await eventMarketingAutomations(eventId)).map((a) => ({
              type: a.type as "POST_EVENT",
              enabled: a.enabled,
              subject: a.subject,
              content: automationDoc(a.content, a.subject),
              sent: !!a.lastRunAt,
            }))}
          />
        ) : (
          <ProLocked orgSlug={orgSlug} feature="EMAIL_MARKETING" canUpgrade={can(ctx.membership, "BILLING_MANAGE")} />
        )
      ) : null}
      {!readOnly ? (
        <EventAppearance
          orgSlug={orgSlug}
          eventId={eventId}
          cover={e.coverImageUrl}
          subdomain={e.subdomain}
          baseDomain={env().NEXT_PUBLIC_BASE_DOMAIN}
          canSubdomain={hasFeature(ctx.features, "EVENT_SUBDOMAINS")}
          protocol={new URL(env().NEXT_PUBLIC_APP_URL).protocol}
        />
      ) : null}
    </div>
  );
}
