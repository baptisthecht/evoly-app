import "server-only";
import { CoreError, hasFeature } from "@evoly/core";
import { db } from "@/lib/db";
import type { OrgContext } from "./context";
import { findEvent } from "./events";

/**
 * Tables et forfaits (section 9.31, Pro) : un tarif peut donner plusieurs billets par achat (une table de 6), avec des noms de tables
 * et des consommations comprises, ajoutées gratuitement à chaque table et retirées au bar (section 9.29).
 */
export type TableSettingsInput = { groupSize: number; tableLabels: string[]; included: Array<{ optionId: string; quantity: number }> };

export async function saveTableSettings(ctx: OrgContext, eventId: string, ticketTypeId: string, input: TableSettingsInput) {
  if (!hasFeature(ctx.features, "SEATING_MAPS")) throw new CoreError("FEATURE_UNAVAILABLE");
  await findEvent(ctx, eventId);
  const tt = await db.ticketType.findFirst({
    where: { id: ticketTypeId, eventId },
    select: { id: true, groupSize: true, quantitySold: true, quantityHeld: true, quantityAllocated: true },
  });
  if (!tt) throw new CoreError("NOT_FOUND");
  const groupSize = Math.trunc(input.groupSize);
  if (!Number.isFinite(groupSize) || groupSize < 1 || groupSize > 30) throw new CoreError("TABLE_SIZE_INVALID");
  // des billets déjà émis ne changent jamais de nombre : le nombre de personnes est verrouillé dès la première vente
  if (groupSize !== tt.groupSize && tt.quantitySold + tt.quantityHeld + tt.quantityAllocated > 0) throw new CoreError("TABLE_LOCKED");
  const tableLabels = input.tableLabels
    .map((l) => l.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 200);
  const options = await db.eventOption.findMany({ where: { eventId, id: { in: input.included.map((i) => i.optionId) } }, select: { id: true } });
  const included = input.included.filter(
    (i) => options.some((o) => o.id === i.optionId) && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= 100,
  );
  await db.$transaction([
    db.ticketType.update({ where: { id: tt.id }, data: { groupSize, tableLabels } }),
    db.includedOption.deleteMany({ where: { ticketTypeId: tt.id } }),
    db.includedOption.createMany({ data: included.map((i) => ({ ticketTypeId: tt.id, optionId: i.optionId, quantity: i.quantity })) }),
  ]);
}

/** Pour l'organisateur : réglages de forfait de chaque tarif, et les options de l'événement à inclure. */
export async function tableSettings(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  const [types, options] = await Promise.all([
    db.ticketType.findMany({
      where: { eventId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        priceMinor: true,
        groupSize: true,
        tableLabels: true,
        quantitySold: true,
        quantityHeld: true,
        quantityAllocated: true,
        includedOptions: { select: { optionId: true, quantity: true } },
      },
    }),
    db.eventOption.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
  ]);
  return { types: types.map((t) => ({ ...t, locked: t.quantitySold + t.quantityHeld + t.quantityAllocated > 0 })), options };
}
