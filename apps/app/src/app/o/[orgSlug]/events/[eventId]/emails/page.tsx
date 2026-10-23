import { can } from "@evoly/core";
import type { Metadata } from "next";
import { ProLocked } from "@/components/ProLocked";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { EventReminders } from "../settings/EventReminders";
import { eventEmailBlocks } from "@/server/eventEmailBlocks";
import { EventEmailBlocks } from "../settings/EventEmailBlocks";
import { EventMarketingEmails } from "../settings/EventMarketingEmails";
import {
  eventMarketingAutomations,
  eventReminders,
  automationDoc,
} from "@/server/automations";
import { hasFeature } from "@evoly/core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("emails") };
}

export default async function EventEmailsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const readOnly =
    !can(ctx.membership, "EVENTS_EDIT") ||
    ctx.readOnly ||
    ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status);
  const tn = await getTranslations("nav");
  const emailBlocks = await eventEmailBlocks(eventId);
  return (
    <div className="max-w-3xl">
      {readOnly ? (
        <p className="text-sm text-ink-muted">{tn("readOnlyPage")}</p>
      ) : null}
      {!readOnly ? (
        <EventEmailBlocks
          orgSlug={orgSlug}
          eventId={eventId}
          ticket={emailBlocks.ticket}
          reminder={emailBlocks.reminder}
        />
      ) : null}
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
            automations={(await eventMarketingAutomations(eventId)).map(
              (a) => ({
                type: a.type as "POST_EVENT",
                enabled: a.enabled,
                subject: a.subject,
                content: automationDoc(a.content, a.subject),
                sent: !!a.lastRunAt,
              }),
            )}
          />
        ) : (
          <ProLocked
            orgSlug={orgSlug}
            feature="EMAIL_MARKETING"
            canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
          />
        )
      ) : null}
    </div>
  );
}
