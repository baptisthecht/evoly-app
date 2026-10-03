import { can, hasFeature, minorToInput, utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { listQuestions } from "@/server/questions";
import { QuestionsManager } from "./QuestionsManager";
import { SeatingManager } from "./SeatingManager";
import { ProLocked, SeatingPreview } from "@/components/ProLocked";
import { seatingOverview } from "@/server/seating";
import { ComplimentaryForm } from "./ComplimentaryForm";
import { getEventWithTickets } from "@/server/events";
import { getPlans } from "@/server/plans";
import { NewTicketType } from "./NewTicketType";
import { TicketTypeCard, type TicketTypeRow } from "./TicketTypeEditor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabTickets") };
}

export default async function TicketsPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("tickets");
  const plans = await getPlans();
  const terms = plans[ctx.plan].terms[event.currency] ?? plans[ctx.plan].terms.EUR!;
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
    salesStartLocal: local(tt.salesStartAt),
    salesEndLocal: local(tt.salesEndAt),
    visibility: tt.visibility,
    status: tt.status,
    isNominative: tt.isNominative,
    requireHolderEmail: tt.requireHolderEmail,
    resaleAllowed: tt.resaleAllowed,
    priceLocked: !!tt.priceLockedAt || tt.quantitySold > 0,
    tiers: tt.priceTiers.map((p) => ({ id: p.id, name: p.name, price: minorToInput(p.priceMinor), startsAtLocal: local(p.startsAt), endsAtLocal: local(p.endsAt), quantityLimit: p.quantityLimit != null ? String(p.quantityLimit) : "", sold: p.quantitySold })),
  }));
  const manage = can(ctx.membership, "TICKETS_MANAGE") && !ctx.readOnly && !["CANCELLED", "ENDED", "ARCHIVED"].includes(event.status);
  const tiersEnabled = hasFeature(ctx.features, "DYNAMIC_PRICING");
  return (
    <div className="grid max-w-4xl gap-4">
      <p className="text-ink-muted">{t("pageIntro")}</p>
      {rows.length === 0 ? <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState> : null}
      {rows.map((row, i) => (
        <TicketTypeCard key={row.id} orgSlug={orgSlug} eventId={eventId} row={row} terms={terms} currency={event.currency} index={i} count={rows.length} tiersEnabled={tiersEnabled && manage} tiersLocked={!manage} />
      ))}
      {manage ? <NewTicketType orgSlug={orgSlug} eventId={eventId} terms={terms} /> : null}
      {can(ctx.membership, "ORDERS_MANAGE") && !ctx.readOnly && event.ticketTypes.length > 0 ? <ComplimentaryForm orgSlug={orgSlug} eventId={eventId} ticketTypes={event.ticketTypes.map((tt) => ({ id: tt.id, name: tt.name }))} /> : null}
      {hasFeature(ctx.features, "SEATING_MAPS") ? (
        await (async () => {
          const seating = await seatingOverview(ctx, eventId);
          return (
            <SeatingManager
              orgSlug={orgSlug}
              eventId={eventId}
              assigned={seating.mode === "ASSIGNED"}
              allowChoice={seating.allowChoice}
              readOnly={!can(ctx.membership, "TICKETS_MANAGE") || ctx.readOnly}
              ticketTypes={event.ticketTypes.map((tt) => ({ id: tt.id, name: tt.name }))}
              categories={(seating.map?.categories ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, ticketTypes: c.ticketTypes }))}
              rows={(seating.map?.rows ?? []).map((r) => ({ id: r.id, name: r.name, categoryId: r.categoryId, seats: r.seats }))}
            />
          );
        })()
      ) : (
        <ProLocked orgSlug={orgSlug} feature="SEATING_MAPS" canUpgrade={can(ctx.membership, "BILLING_MANAGE")} preview={<SeatingPreview />} />
      )}
      <QuestionsManager
        orgSlug={orgSlug}
        eventId={eventId}
        readOnly={!can(ctx.membership, "TICKETS_MANAGE") || ctx.readOnly}
        ticketTypes={event.ticketTypes.map((tt) => ({ id: tt.id, name: tt.name }))}
        questions={(await listQuestions(ctx, eventId)).map((q) => ({ id: q.id, label: q.label, helpText: q.helpText, type: q.type, options: (q.options as string[] | null) ?? null, required: q.required, scope: q.scope, ticketTypeIds: q.ticketTypeIds, archived: !!q.archivedAt, answers: q._count.answers }))}
      />
    </div>
  );
}
