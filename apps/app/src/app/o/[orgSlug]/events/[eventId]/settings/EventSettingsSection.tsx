import { can, utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { SettingsForm } from "./SettingsForm";
import { partnerVenueFor } from "@/server/events";

/** Réglages d'un événement, une partie : Général, Lieu ou Vente (un seul formulaire, enregistré automatiquement). */
export async function EventSettingsSection({
  orgSlug,
  eventId,
  section,
}: {
  orgSlug: string;
  eventId: string;
  section: "general" | "venue" | "sales";
}) {
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const local = (d: Date | null) => (d ? utcToZonedLocal(d, e.timezone) : "");
  const readOnly =
    !can(ctx.membership, "EVENTS_EDIT") ||
    ctx.readOnly ||
    ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status);
  return (
    <div>
      <SettingsForm
        orgSlug={orgSlug}
        venue={await partnerVenueFor(ctx.organization.id)}
        eventId={eventId}
        section={section}
        typeLimits={e.ticketTypes.map((tt) => ({
          name: tt.name,
          maxPerBuyer: tt.maxPerBuyer ?? null,
        }))}
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
          presaleMaxTicketsPerBuyer: e.presaleMaxTicketsPerBuyer,
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
