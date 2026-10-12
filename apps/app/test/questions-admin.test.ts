import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { answersCsv, listQuestions, moveQuestion, removeQuestion, saveQuestion } from "@/server/questions";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("questions aux acheteurs (US-QST-01)", () => {
  it("création, ordre, modification, export ; suppression, ou archivage si des réponses existent", async () => {
    const id = rid();
    const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
    await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE" } });
    const event = await db.event.create({
      data: {
        organizationId: org.id,
        slug: `gala-${id}`,
        publicCode: id.toUpperCase().slice(0, 8),
        title: `Gala ${id}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 20 * 86_400_000),
        status: "PUBLISHED",
        ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50 } },
      },
      include: { ticketTypes: true },
    });
    const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
    const taille = await saveQuestion(ctx, event.id, null, { label: "Taille de t-shirt", type: "SELECT", required: true, options: "S\nM\nL" });
    const allergies = await saveQuestion(ctx, event.id, null, { label: "Allergies", type: "TEXT", required: false });
    const libelles = async () => (await listQuestions(ctx, event.id)).filter((q) => !q.archivedAt).map((q) => q.label);
    expect(await libelles()).toEqual(["Taille de t-shirt", "Allergies"]);
    await moveQuestion(ctx, event.id, allergies.id, -1);
    expect(await libelles()).toEqual(["Allergies", "Taille de t-shirt"]);
    await saveQuestion(ctx, event.id, allergies.id, { label: "Allergies alimentaires", type: "TEXT", required: false });
    expect(await libelles()).toEqual(["Allergies alimentaires", "Taille de t-shirt"]);
    // une réponse sur « Taille » : elle s'archive au lieu de disparaître ; « Allergies », sans réponse, se supprime
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `c.${id}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
    await finalizeOrder(r.orderId);
    await db.questionAnswer.create({ data: { questionId: taille.id, orderId: r.orderId, value: "M" } });
    const csv = await answersCsv(ctx, event.id);
    expect(csv).toContain("Taille de t-shirt");
    expect(csv).toContain("Alex");
    expect(await removeQuestion(ctx, event.id, allergies.id)).toBe("DELETED");
    expect(await removeQuestion(ctx, event.id, taille.id)).toBe("ARCHIVED");
    expect(await libelles()).toEqual([]);
  });
});
