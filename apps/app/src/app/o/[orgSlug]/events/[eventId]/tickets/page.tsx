import { can, hasFeature, minorToInput, utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { getPlans } from "@/server/plans";
import { NewTicketType } from "./NewTicketType";
import { type TicketTypeRow } from "./TicketTypeEditor";
import { TicketTypesTable } from "./TicketTypesTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabTickets") };
}

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("tickets");
  const plans = await getPlans();
  const terms =
    plans[ctx.plan].terms[event.currency] ?? plans[ctx.plan].terms.EUR!;
  const tz = event.timezone;
  const local = (d: Date | null) => (d ? utcToZonedLocal(d, tz) : "");
  const rows: TicketTypeRow[] = event.ticketTypes.map((tt) => ({
    id: tt.id,
    name: tt.name,
    description: tt.description ?? "",
    price: minorToInput(tt.priceMinor),
    priceMinor: tt.priceMinor,
    quantity: tt.quantity != null ? String(tt.quantity) : "",
    quantitySold: tt.quantitySold,
    minPerOrder: tt.minPerOrder,
    maxPerOrder: tt.maxPerOrder,
    maxPerBuyer: tt.maxPerBuyer ?? null,
    salesStartLocal: local(tt.salesStartAt),
    salesEndLocal: local(tt.salesEndAt),
    visibility: tt.visibility,
    status: tt.status,
    isNominative: tt.isNominative,
    requireHolderEmail: tt.requireHolderEmail,
    resaleAllowed: tt.resaleAllowed,
    priceLocked: !!tt.priceLockedAt || tt.quantitySold > 0,
    tiers: tt.priceTiers.map((p) => ({
      id: p.id,
      name: p.name,
      price: minorToInput(p.priceMinor),
      startsAtLocal: local(p.startsAt),
      endsAtLocal: local(p.endsAt),
      quantityLimit: p.quantityLimit != null ? String(p.quantityLimit) : "",
      sold: p.quantitySold,
    })),
  }));
  const manage =
    can(ctx.membership, "TICKETS_MANAGE") &&
    !ctx.readOnly &&
    !["CANCELLED", "ENDED", "ARCHIVED"].includes(event.status);
  const tiersEnabled = hasFeature(ctx.features, "DYNAMIC_PRICING");
  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">{t("pageIntro")}</p>
      {manage ? (
        <NewTicketType orgSlug={orgSlug} eventId={eventId} terms={terms} />
      ) : null}
      <TicketTypesTable
        rows={rows}
        orgSlug={orgSlug}
        eventId={eventId}
        terms={terms}
        currency={event.currency}
        tiersEnabled={tiersEnabled && manage}
        tiersLocked={!manage}
        manage={manage}
      />
    </div>
  );
}
