import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { EmptyState } from "@/components/ui/Card";
import { formatDateTime, type Locale } from "@evoly/i18n";
import { getLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { ComplimentaryTable } from "./ComplimentaryTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("complimentary") };
}

/** Billetterie, billets offerts : inviter des personnes, sans paiement. */
export default async function ComplimentaryPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("tickets");
  const manage = can(ctx.membership, "ORDERS_MANAGE") && !ctx.readOnly;
  if (event.ticketTypes.length === 0)
    return <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>;
  const locale = (await getLocale()) as Locale;
  const offered = await db.order.findMany({
    where: { eventId, source: "COMPLIMENTARY" },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      buyerFirstName: true,
      buyerLastName: true,
      buyerEmail: true,
      createdAt: true,
      items: {
        select: { quantity: true, ticketType: { select: { name: true } } },
      },
      tickets: { select: { status: true } },
    },
  });
  return (
    <ComplimentaryTable
      orgSlug={orgSlug}
      eventId={eventId}
      manage={manage}
      ticketTypes={event.ticketTypes.map((tt) => ({
        id: tt.id,
        name: tt.name,
      }))}
      rows={offered.map((o) => ({
        id: o.id,
        name: `${o.buyerFirstName} ${o.buyerLastName}`.trim() || o.buyerEmail,
        email: o.buyerEmail,
        types: o.items
          .map((i) => `${i.quantity} × ${i.ticketType.name}`)
          .join(", "),
        tickets: o.tickets.length,
        entered: o.tickets.filter((tk) => tk.status === "CHECKED_IN").length,
        sent: formatDateTime(o.createdAt, event.timezone, locale, "short"),
        sentAt: o.createdAt.getTime(),
        href: `/o/${orgSlug}/orders/${o.id}`,
      }))}
    />
  );
}
