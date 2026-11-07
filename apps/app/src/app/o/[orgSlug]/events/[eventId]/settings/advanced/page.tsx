import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsRow } from "@/components/ui/Controls";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { CancelEvent } from "../../CancelEvent";
import { EventCommand } from "../../EventCommands";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settingsAdvanced") };
}

/** Réglages d'un événement, avancé : dupliquer, supprimer un brouillon, annuler l'événement. */
export default async function EventSettingsAdvanced({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const [t, ts] = await Promise.all([
    getTranslations("events"),
    getTranslations("eventSettings"),
  ]);
  const isLive =
    event.status === "PUBLISHED" || event.status === "SALES_PAUSED";
  const canPublish = can(ctx.membership, "EVENTS_PUBLISH") && !ctx.readOnly;
  // refonte A3 (maquette Réglages) : une section par action, le titre et l'explication à gauche, le bouton à droite
  return (
    <div className="-mt-[18px] grid">
      {canPublish && isLive ? (
        <SettingsRow title={ts("pauseTitle")} description={ts("pauseDesc")}>
          <span>
            <EventCommand
              orgSlug={orgSlug}
              eventId={eventId}
              command={event.status === "PUBLISHED" ? "pause" : "resume"}
              variant="secondary"
            />
          </span>
        </SettingsRow>
      ) : null}
      {can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly ? (
        <SettingsRow
          title={t("advDuplicateTitle")}
          description={t("advDuplicateDesc")}
        >
          <span>
            <EventCommand
              orgSlug={orgSlug}
              eventId={eventId}
              command="duplicate"
              variant="secondary"
            />
          </span>
        </SettingsRow>
      ) : null}
      {can(ctx.membership, "EVENTS_DELETE") && event.status === "DRAFT" ? (
        <SettingsRow
          title={t("advDeleteTitle")}
          description={t("advDeleteDesc")}
        >
          <span>
            <EventCommand
              orgSlug={orgSlug}
              eventId={eventId}
              command="delete"
              variant="secondary"
              confirm={t("confirmDelete")}
            />
          </span>
        </SettingsRow>
      ) : null}
      {can(ctx.membership, "EVENTS_CANCEL") && !ctx.readOnly && isLive ? (
        <SettingsRow
          title={t("advCancelTitle")}
          description={t("advCancelDesc")}
        >
          <CancelEvent
            orgSlug={orgSlug}
            eventId={eventId}
            title={event.title}
            paidOrders={await db.order.count({
              where: {
                eventId,
                totalMinor: { gt: 0 },
                status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
              },
            })}
          />
        </SettingsRow>
      ) : null}
      {event.status === "CANCELLED" ? (
        <p className="mt-5 rounded-[8px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {t("cancelledNotice", { reason: event.cancellationReason ?? "" })}
        </p>
      ) : null}
    </div>
  );
}
