import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { EmptyState } from "@/components/ui/Card";
import { ComplimentaryForm } from "../ComplimentaryForm";

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
  return manage ? (
    <ComplimentaryForm
      orgSlug={orgSlug}
      eventId={eventId}
      ticketTypes={event.ticketTypes.map((tt) => ({
        id: tt.id,
        name: tt.name,
      }))}
    />
  ) : null;
}
