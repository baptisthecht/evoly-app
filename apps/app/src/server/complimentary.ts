import "server-only";
import { CoreError, humanCode, orderReference, sha256Hex, type Recipient } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { finalizeOrder, ID_ALPHABET, lockEvent, orderAccessToken } from "./checkout";
import type { OrgContext } from "./context";
import { afterOrderPaid } from "./orders";

export type ComplimentaryResult = { email: string; ok: true; orderId: string } | { email: string; ok: false; error: string };

/**
 * US-ORD-03 : billets offerts à une liste d'adresses. Une commande COMPLIMENTARY par destinataire, à 0 € (ni paiement
 * ni commission), décomptée de la jauge : places réservées sous verrou, puis même finalisation qu'une commande gratuite
 * (billets, contact sans consentement marketing, e-mail avec le PDF). Envoi partiel possible, rapporté ligne par ligne.
 */
export async function sendComplimentaryTickets(
  ctx: OrgContext,
  eventId: string,
  input: { ticketTypeId: string; recipients: Recipient[]; quantityEach: number },
  now = new Date(),
): Promise<ComplimentaryResult[]> {
  const n = input.quantityEach;
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new CoreError("COMPLIMENTARY_QUANTITY");
  if (input.recipients.length === 0 || input.recipients.length > 200) throw new CoreError("COMPLIMENTARY_RECIPIENTS");
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    include: { ticketTypes: { where: { id: input.ticketTypeId } } },
  });
  const type = event?.ticketTypes[0];
  if (!event || !type) throw new CoreError("NOT_FOUND");
  if (["DRAFT", "CANCELLED", "ARCHIVED"].includes(event.status) || event.startsAt.getTime() + 12 * 3_600_000 < now.getTime())
    throw new CoreError("COMPLIMENTARY_EVENT_CLOSED");
  const results: ComplimentaryResult[] = [];
  for (const r of input.recipients) {
    const orderId = `c${humanCode(24, ID_ALPHABET)}`;
    try {
      const accessTokenHash = await sha256Hex(orderAccessToken(orderId, 1));
      await db.$transaction(async (tx) => {
        if (!(await lockEvent(tx, event.id))) throw new CoreError("NOT_FOUND");
        const held =
          await tx.$executeRaw`UPDATE "TicketType" SET "quantityHeld" = "quantityHeld" + ${n} WHERE id = ${type.id} AND ("quantity" IS NULL OR "quantity" - "quantitySold" - "quantityHeld" >= ${n})`;
        if (held !== 1) throw new CoreError("COMPLIMENTARY_NO_STOCK");
        await tx.order.create({
          data: {
            id: orderId,
            reference: orderReference(),
            organizationId: event.organizationId,
            eventId: event.id,
            source: "COMPLIMENTARY",
            status: "PENDING",
            buyerEmail: r.email,
            // sans nom fourni : la partie de l'adresse avant le @, pour saluer le destinataire
            buyerFirstName:
              r.firstName ??
              r.email
                .split("@")[0]!
                .split(/[._-]/)[0]!
                .replace(/^./, (c) => c.toUpperCase()),
            buyerLastName: r.lastName ?? "",
            buyerLocale: ctx.organization.locale,
            currency: event.currency,
            subtotalMinor: 0,
            discountMinor: 0,
            totalMinor: 0,
            applicationFeeMinor: 0,
            // instantané des frais : billet offert, sans prix ni commission (traçabilité comptable)
            feeSnapshot: { kind: "COMPLIMENTARY", unitPriceMinor: 0, applicationFeeMinor: 0 },
            marketingOptIn: false,
            holdExpiresAt: new Date(now.getTime() + 15 * 60_000),
            accessTokenHash,
            items: { create: [{ ticketTypeId: type.id, quantity: n, unitPriceMinor: 0, unitDiscountMinor: 0, unitFeeMinor: 0 }] },
          },
        });
      });
      const outcome = await finalizeOrder(orderId, undefined, now);
      if (outcome !== "PAID") throw new CoreError("COMPLIMENTARY_NO_STOCK"); // jauge globale atteinte à la finalisation
      await afterOrderPaid(orderId);
      results.push({ email: r.email, ok: true, orderId });
    } catch (err) {
      results.push({ email: r.email, ok: false, error: err instanceof CoreError ? err.code : "UNKNOWN" });
      if (!(err instanceof CoreError)) console.error("billet offert non envoyé", orderId, err instanceof Error ? err.message : "erreur");
    }
  }
  const sent = results.filter((x) => x.ok).length;
  await audit({
    action: "order.complimentary_sent",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Event",
    targetId: event.id,
    metadata: { recipients: input.recipients.length, sent, ticketsEach: n },
  });
  return results;
}
