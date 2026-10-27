import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
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
  const t = await getTranslations("events");
  const isLive =
    event.status === "PUBLISHED" || event.status === "SALES_PAUSED";
  return (
    <Card className="grid max-w-xl content-start gap-3">
      <p className="text-sm text-ink-muted">{t("advancedIntro")}</p>
      {can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly ? (
        <EventCommand
          orgSlug={orgSlug}
          eventId={eventId}
          command="duplicate"
          variant="secondary"
        />
      ) : null}
      {can(ctx.membership, "EVENTS_DELETE") && event.status === "DRAFT" ? (
        <EventCommand
          orgSlug={orgSlug}
          eventId={eventId}
          command="delete"
          variant="ghost"
          confirm={t("confirmDelete")}
        />
      ) : null}
      {can(ctx.membership, "EVENTS_CANCEL") && !ctx.readOnly && isLive ? (
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
      ) : null}
      {event.status === "CANCELLED" ? (
        <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {t("cancelledNotice", { reason: event.cancellationReason ?? "" })}
        </p>
      ) : null}
    </Card>
  );
}
