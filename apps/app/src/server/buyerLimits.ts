import { CoreError } from "@evoly/core";
import { db } from "@/lib/db";

/**
 * Limites par acheteur (RG-BUY-09), d'après l'adresse normalisée : sur tout
 * l'événement, par tarif, et pendant la prévente (commandes passées avec un code
 * de prévente). Ce que l'acheteur a déjà pris : les billets valides de ses
 * commandes payées, et ses paniers en cours dans le délai de réservation (deux
 * onglets ouverts ne contournent rien). Un code promo qui relève la limite passe
 * avant elle, sans jamais l'abaisser. Commandes en ligne seulement : l'organisateur
 * n'est jamais limité.
 */
export async function checkBuyerLimits(input: {
  orderId: string;
  eventId: string;
  key: string;
  items: { ticketTypeId: string; quantity: number }[];
  promoCodeId: string | null;
  presaleCodeId: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const typeIds = [...new Set(input.items.map((i) => i.ticketTypeId))];
  const [event, types, promo] = await Promise.all([
    db.event.findUniqueOrThrow({
      where: { id: input.eventId },
      select: {
        maxTicketsPerBuyer: true,
        presaleMaxTicketsPerBuyer: true,
        checkoutHoldMinutes: true,
      },
    }),
    db.ticketType.findMany({
      where: { id: { in: typeIds } },
      select: { id: true, maxPerBuyer: true },
    }),
    input.promoCodeId
      ? db.promoCode.findUnique({
          where: { id: input.promoCodeId },
          select: { raisesLimitTo: true },
        })
      : null,
  ]);
  const raised = promo?.raisesLimitTo ?? null;
  const limitOf = (l: number | null) =>
    l == null ? null : raised != null ? Math.max(l, raised) : l;
  const eventLimit = limitOf(event.maxTicketsPerBuyer);
  const presaleLimit = input.presaleCodeId
    ? limitOf(event.presaleMaxTicketsPerBuyer)
    : null;
  const typeLimits = new Map(types.map((t) => [t.id, limitOf(t.maxPerBuyer)]));
  if (
    eventLimit == null &&
    presaleLimit == null &&
    [...typeLimits.values()].every((l) => l == null)
  )
    return;

  const since = new Date(now.getTime() - event.checkoutHoldMinutes * 60_000);
  const taken = async (presaleOnly: boolean) => {
    const mine = {
      eventId: input.eventId,
      buyerEmailKey: input.key,
      id: { not: input.orderId },
      ...(presaleOnly ? { presaleCodeId: { not: null } } : {}),
    };
    const [paid, pending] = await Promise.all([
      db.ticket.groupBy({
        by: ["ticketTypeId"],
        where: {
          eventId: input.eventId,
          status: { in: ["VALID", "CHECKED_IN"] },
          order: { ...mine, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
        },
        _count: { _all: true },
      }),
      db.orderItem.groupBy({
        by: ["ticketTypeId"],
        where: {
          order: { ...mine, status: "PENDING", createdAt: { gte: since } },
        },
        _sum: { quantity: true },
      }),
    ]);
    const byType = new Map<string, number>();
    for (const r of paid)
      byType.set(
        r.ticketTypeId,
        (byType.get(r.ticketTypeId) ?? 0) + r._count._all,
      );
    for (const r of pending)
      byType.set(
        r.ticketTypeId,
        (byType.get(r.ticketTypeId) ?? 0) + (r._sum.quantity ?? 0),
      );
    return byType;
  };
  const wanted = new Map<string, number>();
  for (const i of input.items)
    wanted.set(i.ticketTypeId, (wanted.get(i.ticketTypeId) ?? 0) + i.quantity);
  const sum = (m: Map<string, number>) =>
    [...m.values()].reduce((n, v) => n + v, 0);

  const already = await taken(false);
  if (eventLimit != null && sum(already) + sum(wanted) > eventLimit)
    throw new CoreError("BUYER_LIMIT_REACHED");
  for (const [id, qty] of wanted) {
    const l = typeLimits.get(id);
    if (l != null && (already.get(id) ?? 0) + qty > l)
      throw new CoreError("BUYER_TYPE_LIMIT_REACHED");
  }
  if (
    presaleLimit != null &&
    sum(await taken(true)) + sum(wanted) > presaleLimit
  )
    throw new CoreError("PRESALE_BUYER_LIMIT_REACHED");
}
