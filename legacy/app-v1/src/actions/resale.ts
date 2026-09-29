"use server";
import crypto from "crypto";

import { db } from "@evoly/db";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

// ── RESALE-01 : Créer un lien de revente ─────────────────────────────────────

const createResaleSchema = z.object({
  ticketId: z.string(),
  magicToken: z.string(), // auth de l'acheteur original
  priceCents: z.number().int().min(0),
});

export async function createResaleLinkAction(input: z.infer<typeof createResaleSchema>) {
  const parsed = createResaleSchema.safeParse(input);
  if (!parsed.success) return { error: "Données invalides" };

  const { ticketId, magicToken, priceCents } = parsed.data;

  // Verify ownership via magic token
  const order = await db.order.findFirst({
    where: { magicToken },
    include: {
      tickets: { where: { id: ticketId } },
      event: { select: { id: true, title: true, startsAt: true, status: true } },
    },
  });

  if (!order || order.tickets.length === 0) {
    return { error: "Billet introuvable ou accès refusé" };
  }

  const ticket = order.tickets[0]!;

  if (ticket.status !== "ACTIVE") {
    return { error: "Ce billet ne peut pas être revendu (statut invalide)" };
  }

  if (order.event.status === "CANCELLED") {
    return { error: "L'événement est annulé" };
  }

  if (new Date() >= new Date(order.event.startsAt)) {
    return { error: "L'événement a déjà commencé" };
  }

  // Check price cap: max 2x original price
  const orderItem = await db.orderItem.findFirst({
    where: { id: ticket.orderItemId },
  });
  const originalPriceCents = orderItem?.unitPriceCents ?? 0;
  const maxPrice = originalPriceCents * 2;

  if (priceCents > maxPrice) {
    return { error: `Prix maximum autorisé : ${(maxPrice / 100).toFixed(2)}€ (2x le prix original)` };
  }

  // Cancel any existing open resale link for this ticket
  await db.resaleLink.updateMany({
    where: { ticketId, status: "OPEN" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  // Expiry: 2h before event starts
  const expiresAt = new Date(new Date(order.event.startsAt).getTime() - 2 * 60 * 60 * 1000);

  const resaleLink = await db.resaleLink.create({
    data: {
      ticketId,
      priceCents,
      originalPriceCents,
      expiresAt,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
  return {
    success: true,
    resaleUrl: `${appUrl}/resale/${resaleLink.token}`,
    token: resaleLink.token,
  };
}

// ── RESALE-02 : Annuler un lien de revente ───────────────────────────────────

export async function cancelResaleLinkAction(token: string, magicToken: string) {
  const resaleLink = await db.resaleLink.findUnique({
    where: { token },
    include: { ticket: { include: { order: true } } },
  });

  if (!resaleLink) return { error: "Lien introuvable" };
  if (resaleLink.ticket.order.magicToken !== magicToken) return { error: "Accès refusé" };
  if (resaleLink.status !== "OPEN") return { error: "Ce lien ne peut plus être annulé" };

  await db.resaleLink.update({
    where: { token },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return { success: true };
}

// ── RESALE-03 : Récupérer les infos d'un lien de revente (page publique) ─────

export async function getResaleLinkAction(token: string) {
  const resaleLink = await db.resaleLink.findUnique({
    where: { token },
    include: {
      ticket: {
        include: {
          order: {
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  startsAt: true,
                  endsAt: true,
                  timezone: true,
                  locationType: true,
                  locationName: true,
                  locationAddress: true,
                  bannerUrl: true,
                  slug: true,
                  organization: {
                    select: {
                      name: true,
                      slug: true,
                      brand: { select: { primaryColor: true, logoUrl: true, brandName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!resaleLink) return { error: "Lien introuvable" };

  // Check expiry
  if (resaleLink.status === "OPEN" && new Date() > resaleLink.expiresAt) {
    await db.resaleLink.update({ where: { token }, data: { status: "EXPIRED" } });
    return { error: "Ce lien de revente a expiré" };
  }

  if (resaleLink.status !== "OPEN") {
    const messages: Record<string, string> = {
      SOLD: "Ce billet a déjà été vendu",
      CANCELLED: "Ce lien de revente a été annulé",
      EXPIRED: "Ce lien de revente a expiré",
      PENDING: "Un achat est déjà en cours pour ce billet",
    };
    return { error: messages[resaleLink.status] ?? "Lien indisponible" };
  }

  return {
    resaleLink: {
      token: resaleLink.token,
      priceCents: resaleLink.priceCents,
      originalPriceCents: resaleLink.originalPriceCents,
      expiresAt: resaleLink.expiresAt.toISOString(),
      event: resaleLink.ticket.order.event,
    },
  };
}

// ── RESALE-04 : Initier le paiement d'un billet en revente ──────────────────

const buyResaleSchema = z.object({
  token: z.string(),
  buyerEmail: z.string().email(),
  buyerFirstName: z.string().min(1),
  buyerLastName: z.string().min(1),
});

export async function initResalePurchaseAction(input: z.infer<typeof buyResaleSchema>) {
  const parsed = buyResaleSchema.safeParse(input);
  if (!parsed.success) return { error: "Données invalides" };

  const { token, buyerEmail, buyerFirstName, buyerLastName } = parsed.data;

  const resaleLink = await db.resaleLink.findUnique({
    where: { token },
    include: {
      ticket: {
        include: {
          order: {
            include: {
              event: {
                include: {
                  organization: { select: { stripeAccountId: true, stripeAccountStatus: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!resaleLink || resaleLink.status !== "OPEN") {
    return { error: "Ce lien de revente est indisponible" };
  }

  if (new Date() > resaleLink.expiresAt) {
    await db.resaleLink.update({ where: { token }, data: { status: "EXPIRED" } });
    return { error: "Ce lien de revente a expiré" };
  }

  const org = resaleLink.ticket.order.event.organization;

  // Billet gratuit revendu à 0€ : pas besoin de Stripe
  if (resaleLink.priceCents === 0) {
    // Invalider l'ancien ticket, créer un nouveau
    const oldTicket = resaleLink.ticket;
    await db.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: oldTicket.id }, data: { status: "CANCELLED" } });
      await tx.ticket.create({
        data: {
          orderId: oldTicket.orderId,
          orderItemId: oldTicket.orderItemId,
          qrCode: crypto.randomUUID(),
          holderFirstName: buyerFirstName,
          holderLastName: buyerLastName,
          holderEmail: buyerEmail,
          status: "ACTIVE",
        },
      });
      await tx.resaleLink.update({ where: { token }, data: { status: "SOLD" } });
    });
    return { success: true, free: true };
  }

  if (!org.stripeAccountId || org.stripeAccountStatus !== "ACTIVE") {
    return { error: "Le vendeur ne peut pas recevoir de paiements pour le moment" };
  }

  // Commission Evoly : 5% sur la revente
  const commissionCents = Math.round(resaleLink.priceCents * 0.05);

  const pi = await stripe.paymentIntents.create({
    amount: resaleLink.priceCents,
    currency: "eur",
    application_fee_amount: commissionCents,
    transfer_data: { destination: org.stripeAccountId },
    metadata: {
      resaleLinkToken: token,
      buyerEmail,
      buyerFirstName,
      buyerLastName,
    },
  });

  // Mark as PENDING + store buyer info
  await db.resaleLink.update({
    where: { token },
    data: {
      status: "PENDING",
      buyerEmail,
      buyerFirstName,
      buyerLastName,
      stripePaymentIntentId: pi.id,
    },
  });

  return { clientSecret: pi.client_secret };
}
