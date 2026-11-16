import "server-only";
import { buyerEmailKey, buyerNameKey, CoreError } from "@evoly/core";
import type { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { notify } from "./notifications";

type Tx = Prisma.TransactionClient | typeof db;

/**
 * Personnes bloquées par une organisation (lot « bloquer une personne »). Liste propre à chaque organisation, jamais
 * partagée : une personne bloquée par une organisation commande librement chez les autres.
 * RG-BLK-01 : adresse e-mail bloquée, comparée normalisée (buyerEmailKey : casse, points Gmail, suffixes « + »).
 * RG-BLK-02 : carte bloquée, par son empreinte (Stripe), refusée avant le débit.
 * RG-BLK-03 : prénom et nom identiques : la commande passe, signalée, et l'organisation est prévenue (homonymes).
 * RG-BLK-04 : l'acheteur bloqué lit un message neutre, sans motif (code BUYER_BLOCKED).
 * RG-BLK-05 : le blocage vaut aussi pour la revente et la liste d'attente.
 */
export const BUYER_BLOCKED = "BUYER_BLOCKED";

export async function isEmailBlocked(
  organizationId: string,
  email: string | null | undefined,
  tx: Tx = db,
): Promise<boolean> {
  const emailKey = buyerEmailKey(email);
  if (!emailKey) return false;
  const found = await tx.blockedBuyer.findFirst({
    where: { organizationId, emailKey },
    select: { id: true },
  });
  return !!found;
}

export async function isCardBlocked(
  organizationId: string,
  fingerprint: string | null | undefined,
  tx: Tx = db,
): Promise<boolean> {
  if (!fingerprint) return false;
  const found = await tx.blockedCard.findFirst({
    where: { organizationId, fingerprint },
    select: { id: true },
  });
  return !!found;
}

/** Refus commun aux achats, à la revente et à la liste d'attente : adresse ou carte bloquée (RG-BLK-01, 02, 05). */
export async function isBlocked(
  organizationId: string,
  who: { email?: string | null; fingerprint?: string | null },
): Promise<boolean> {
  return (
    (await isEmailBlocked(organizationId, who.email)) ||
    (await isCardBlocked(organizationId, who.fingerprint))
  );
}

/**
 * RG-BLK-03 : commande payée au nom d'une personne bloquée (prénom et nom normalisés) : elle passe, porte la pastille
 * « Signalé » et l'organisation est prévenue, une seule fois par commande. Renvoie vrai si la commande est signalée.
 */
export async function flagIfNameMatches(orderId: string): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      organizationId: true,
      reference: true,
      buyerFirstName: true,
      buyerLastName: true,
    },
  });
  if (!order) return false;
  const nameKey = buyerNameKey(order.buyerFirstName, order.buyerLastName);
  if (!nameKey) return false;
  const match = await db.blockedBuyer.findFirst({
    where: { organizationId: order.organizationId, nameKey },
    select: { id: true },
  });
  if (!match) return false;
  const { count } = await db.order.updateMany({
    where: { id: order.id, flaggedAt: null },
    data: { flaggedAt: new Date(), flaggedBlockedBuyerId: match.id },
  });
  if (count > 0)
    await notify(order.organizationId, "BUYER_FLAGGED", {
      title: `Commande ${order.reference} signalée`,
      body: `Passée au nom de ${order.buyerFirstName} ${order.buyerLastName}, comme une personne que vous avez bloquée. Vérifiez-la avant l’événement.`,
      link: `/orders/${order.id}`,
    });
  return true;
}

export type BlockedBuyerRow = {
  id: string;
  name: string | null;
  email: string | null;
  hasCard: boolean;
  reason: string | null;
  addedBy: string | null;
  createdAt: Date;
};

/** Liste de l'organisation : motif, auteur et date visibles par elle seule (RGPD). */
export async function listBlockedBuyers(
  ctx: OrgContext,
): Promise<BlockedBuyerRow[]> {
  const rows = await db.blockedBuyer.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      reason: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
      _count: { select: { cards: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
    email: r.email,
    hasCard: r._count.cards > 0,
    reason: r.reason,
    addedBy: r.createdBy ? r.createdBy.name || r.createdBy.email : null,
    createdAt: r.createdAt,
  }));
}

/** Empreintes des cartes utilisées par cette personne dans cette organisation (même adresse normalisée). */
async function cardsOf(
  organizationId: string,
  emailKey: string | null,
  orderFingerprint: string | null,
): Promise<string[]> {
  const found = new Set<string>();
  if (orderFingerprint) found.add(orderFingerprint);
  if (emailKey) {
    const orders = await db.order.findMany({
      where: {
        organizationId,
        buyerEmailKey: emailKey,
        cardFingerprint: { not: null },
      },
      select: { cardFingerprint: true },
      distinct: ["cardFingerprint"],
    });
    for (const o of orders) found.add(o.cardFingerprint!);
  }
  return [...found];
}

/** « Bloquer cet acheteur » : ce que la fenêtre reprend d'une commande (adresse, nom, cartes de ses commandes). */
export async function blockPreview(ctx: OrgContext, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, organizationId: ctx.organization.id },
    select: {
      buyerEmail: true,
      buyerFirstName: true,
      buyerLastName: true,
      cardFingerprint: true,
    },
  });
  if (!order) throw new CoreError("NOT_FOUND");
  const emailKey = buyerEmailKey(order.buyerEmail);
  const cards = await cardsOf(
    ctx.organization.id,
    emailKey,
    order.cardFingerprint,
  );
  const already = emailKey
    ? await db.blockedBuyer.findFirst({
        where: { organizationId: ctx.organization.id, emailKey },
        select: { id: true },
      })
    : null;
  return {
    email: order.buyerEmail,
    firstName: order.buyerFirstName,
    lastName: order.buyerLastName,
    cards: cards.length,
    alreadyBlocked: !!already,
  };
}

/**
 * Bloque une personne : par adresse (normalisée), par les cartes de ses commandes dans cette organisation, et par son
 * nom pour l'alerte. Une adresse déjà bloquée complète la fiche existante (nouvelles cartes, motif) au lieu d'un
 * doublon. Il faut au moins une adresse, ou un prénom et un nom.
 */
export async function blockBuyer(
  ctx: OrgContext,
  input: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    reason?: string | null;
    orderId?: string | null;
  },
): Promise<{ id: string; cards: number }> {
  const organizationId = ctx.organization.id;
  const order = input.orderId
    ? await db.order.findFirst({
        where: { id: input.orderId, organizationId },
        select: { cardFingerprint: true },
      })
    : null;
  if (input.orderId && !order) throw new CoreError("NOT_FOUND");
  const email = input.email?.trim() || null;
  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  const reason = input.reason?.trim() || null;
  const emailKey = buyerEmailKey(email);
  const nameKey = buyerNameKey(firstName, lastName);
  if (!emailKey && !nameKey) throw new CoreError("BLOCK_NEEDS_EMAIL_OR_NAME");
  const cards = await cardsOf(
    organizationId,
    emailKey,
    order?.cardFingerprint ?? null,
  );
  const existing = emailKey
    ? await db.blockedBuyer.findFirst({
        where: { organizationId, emailKey },
        select: { id: true },
      })
    : null;
  const entry = existing
    ? await db.blockedBuyer.update({
        where: { id: existing.id },
        data: {
          ...(firstName && lastName ? { firstName, lastName, nameKey } : {}),
          ...(reason ? { reason } : {}),
        },
        select: { id: true },
      })
    : await db.blockedBuyer.create({
        data: {
          organizationId,
          email,
          emailKey,
          firstName,
          lastName,
          nameKey,
          reason,
          createdById: ctx.user.id,
        },
        select: { id: true },
      });
  if (cards.length)
    await db.blockedCard.createMany({
      data: cards.map((fingerprint) => ({
        blockedBuyerId: entry.id,
        organizationId,
        fingerprint,
      })),
      skipDuplicates: true,
    });
  // journal : jamais l'adresse ni le motif (RGPD), seulement ce qui a été bloqué
  await audit({
    action: existing ? "buyer.block_updated" : "buyer.blocked",
    organizationId,
    actorUserId: ctx.user.id,
    targetType: "BlockedBuyer",
    targetId: entry.id,
    metadata: {
      email: !!emailKey,
      name: !!nameKey,
      cards: cards.length,
      fromOrder: !!order,
    },
  });
  return { id: entry.id, cards: cards.length };
}

/** Débloque à tout moment : la fiche et ses cartes disparaissent ; les commandes déjà signalées gardent leur pastille. */
export async function unblockBuyer(ctx: OrgContext, id: string): Promise<void> {
  const { count } = await db.blockedBuyer.deleteMany({
    where: { id, organizationId: ctx.organization.id },
  });
  if (count === 0) throw new CoreError("NOT_FOUND");
  await audit({
    action: "buyer.unblocked",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "BlockedBuyer",
    targetId: id,
  });
}
