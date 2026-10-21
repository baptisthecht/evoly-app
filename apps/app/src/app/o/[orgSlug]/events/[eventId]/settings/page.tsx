import { can, utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { SettingsForm } from "./SettingsForm";
import { partnerVenueFor } from "@/server/events";

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
  return (
    <div>
      <SettingsForm
        orgSlug={orgSlug}
        venue={await partnerVenueFor(ctx.organization.id)}
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
          atVenue: !!e.venuePartnerId,
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
          resaleWaitlistFirst: e.resaleWaitlistFirst,
          resaleWaitlistMinutes: e.resaleWaitlistMinutes,
          showResaleSection: e.showResaleSection,
        }}
      />
    </div>
  );
}
