import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createAmbassador, organizationAmbassadorRanking } from "@/server/ambassadors";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function organisation(plan: "pro" | "free") {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (plan === "pro") await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE" } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { org, ctx };
}
async function evenement(orgId: string) {
  const id = rid();
  return db.event.create({
    data: {
      organizationId: orgId,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 100 } },
    },
    include: { ticketTypes: true },
  });
}
/** Achat réel par le lien d'un ambassadeur, puis confirmation du paiement. */
async function acheter(ev: { id: string; ticketTypes: { id: string }[] }, quantity: number, ambassadorCode: string) {
  const r = await reserveOrder({ eventId: ev.id, lines: [{ ticketTypeId: ev.ticketTypes[0]!.id, quantity }], locale: "fr", ambassadorCode });
  await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `acheteur.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  return db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { tickets: true } });
}

describe("classement des ambassadeurs sur toute l'organisation (RG-AMB-05)", () => {
  it("une ligne par personne sur tous les événements (même e-mail, ou même nom sans e-mail) ; mêmes billets que le classement par événement ; anonymisés et autre organisation exclus", async () => {
    const { org, ctx } = await organisation("pro");
    const soiree = await evenement(org.id);
    const gala = await evenement(org.id);
    // Marie : reconnue par son e-mail, malgré deux noms différents
    const marie1 = await createAmbassador(ctx, soiree.id, { name: "Marie Dupont", email: "Marie.Dupont@Exemple.be" });
    const marie2 = await createAmbassador(ctx, gala.id, { name: "Marie D.", email: "marie.dupont@exemple.be" });
    // Léa : sans e-mail, reconnue par son nom (accents, majuscules et espaces ignorés)
    const lea1 = await createAmbassador(ctx, soiree.id, { name: "Léa Martin" });
    const lea2 = await createAmbassador(ctx, gala.id, { name: "lea  martin" });
    const paul = await createAmbassador(ctx, soiree.id, { name: "Paul Lambert" });
    await createAmbassador(ctx, gala.id, { name: "Zoé Leroy" }); // aucune vente : en fin de classement
    await acheter(soiree, 2, marie1.code);
    await acheter(gala, 1, marie2.code);
    const commandeLea = await acheter(soiree, 1, lea1.code);
    await acheter(gala, 1, lea2.code);
    const commandePaul = await acheter(soiree, 2, paul.code);
    // un billet de Paul remboursé : retiré ; le billet de Léa revendu : reste compté à son vendeur d'origine
    await db.ticket.update({ where: { id: commandePaul.tickets[0]!.id }, data: { status: "REFUNDED" } });
    await db.ticket.update({ where: { id: commandeLea.tickets[0]!.id }, data: { status: "VOID", voidReason: "RESOLD" } });
    // ambassadeur anonymisé (12 mois après son événement) : exclu ; autre organisation : jamais mélangée
    const ancien = await createAmbassador(ctx, soiree.id, { name: "Ancien" });
    await db.ambassador.update({ where: { id: ancien.id }, data: { name: "Ambassadeur", email: null, statsToken: `anonyme-${ancien.id}` } });
    const autre = await organisation("pro");
    const autreEv = await evenement(autre.org.id);
    await acheter(autreEv, 5, (await createAmbassador(autre.ctx, autreEv.id, { name: "Marie Dupont", email: "marie.dupont@exemple.be" })).code);

    const classement = await organizationAmbassadorRanking(ctx);
    expect(classement.map((p) => [p.name, p.events, p.tickets, p.amountMinor])).toEqual([
      ["Marie D.", 2, 3, 3000], // le nom le plus récent
      ["lea  martin", 2, 2, 2000],
      ["Paul Lambert", 1, 1, 1000],
      ["Zoé Leroy", 1, 0, 0],
    ]);
    expect(new Set(classement.map((p) => p.key)).size).toBe(4);
  });

  it("réservé à l'offre Pro, comme les ambassadeurs (RG-AMB-06)", async () => {
    const { ctx } = await organisation("free");
    await expect(organizationAmbassadorRanking(ctx)).rejects.toMatchObject({ code: "FEATURE_UNAVAILABLE" });
  });
});
