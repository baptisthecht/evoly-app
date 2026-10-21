import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createEvent, publishEvent } from "@/server/events";
import { answersCsv, moveQuestion, publicQuestions, removeQuestion, saveQuestion } from "@/server/questions";

// questions à l'achat (US-QST-01, RG-QST-03) : validation, ordre, type verrouillé, archivage, export
const rid = () => Math.random().toString(36).slice(2, 10);
const essentials = {
  title: "Gala de printemps",
  startsAtLocal: "2027-04-17T20:00",
  endsAtLocal: "2027-04-18T02:00",
  timezone: "Europe/Brussels",
  locationType: "PHYSICAL" as const,
  locationName: "Salle des fêtes",
  city: "Mouscron",
  country: "BE",
};
async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await createEvent(ctx, essentials, { name: "Entrée", price: "0", quantity: 100 });
  const ticketTypeId = (await db.ticketType.findFirstOrThrow({ where: { eventId: event.id } })).id;
  return { ctx, event, ticketTypeId, id };
}
const refused = (code: string) => expect.objectContaining({ code });
const text = (label: string) => ({ label, type: "TEXT", scope: "ORDER" });

describe("questions à l'achat : validation", () => {
  it("libellé trop court, type inconnu, choix insuffisants refusés ; question inconnue introuvable ; tarifs d'un autre événement ignorés", async () => {
    const { ctx, event, ticketTypeId } = await setup();
    const other = await setup();
    await expect(saveQuestion(ctx, event.id, null, { label: "A", type: "TEXT" })).rejects.toEqual(refused("QUESTION_LABEL"));
    await expect(saveQuestion(ctx, event.id, null, { label: "Couleur préférée", type: "COLOR" })).rejects.toEqual(refused("QUESTION_TYPE"));
    await expect(saveQuestion(ctx, event.id, null, { label: "Menu", type: "SELECT", options: "Viande\nViande\n " })).rejects.toEqual(
      refused("QUESTION_OPTIONS"),
    );
    await expect(saveQuestion(ctx, event.id, "question-inconnue", text("Régime alimentaire"))).rejects.toEqual(refused("NOT_FOUND"));
    const q = await saveQuestion(ctx, event.id, null, { ...text("Régime alimentaire"), scope: "TICKET", ticketTypeIds: [ticketTypeId, other.ticketTypeId] });
    expect(q.ticketTypeIds).toEqual([ticketTypeId]);
  });
});

describe("questions à l'achat : ordre", () => {
  it("monter la troisième question ; la première ne monte pas plus haut", async () => {
    const { ctx, event } = await setup();
    const [a, b, c] = [
      await saveQuestion(ctx, event.id, null, text("Première")),
      await saveQuestion(ctx, event.id, null, text("Deuxième")),
      await saveQuestion(ctx, event.id, null, text("Troisième")),
    ];
    const order = async () => (await publicQuestions(event.id)).map((q) => q.id);
    await moveQuestion(ctx, event.id, c.id, -1);
    expect(await order()).toEqual([a.id, c.id, b.id]);
    await moveQuestion(ctx, event.id, a.id, -1);
    expect(await order()).toEqual([a.id, c.id, b.id]);
  });
});

describe("questions à l'achat : réponses", () => {
  it("avec des réponses : type verrouillé, libellé modifiable, export, archivée ; sans réponse : supprimée", async () => {
    const { ctx, event, ticketTypeId, id } = await setup();
    await publishEvent(ctx, event.id);
    const q = await saveQuestion(ctx, event.id, null, text("Comment nous avez-vous connus ?"));
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, {
      firstName: "Léa",
      lastName: "Martin",
      email: `lea.${id}@exemple.be`,
      marketingOptIn: false,
      answers: { order: { [q.id]: "Par un ami" }, tickets: {} },
    });
    await expect(saveQuestion(ctx, event.id, q.id, { label: q.label, type: "SELECT", options: "Oui\nNon" })).rejects.toEqual(refused("QUESTION_TYPE_LOCKED"));
    await saveQuestion(ctx, event.id, q.id, text("Comment avez-vous connu le gala ?"));
    const csv = await answersCsv(ctx, event.id);
    expect(csv).toContain("Comment avez-vous connu le gala ?");
    expect(csv).toContain("Par un ami");
    expect(await removeQuestion(ctx, event.id, q.id)).toBe("ARCHIVED");
    expect((await publicQuestions(event.id)).map((x) => x.id)).not.toContain(q.id);
    const fresh = await saveQuestion(ctx, event.id, null, text("Taille de t-shirt"));
    expect(await removeQuestion(ctx, event.id, fresh.id)).toBe("DELETED");
    await expect(removeQuestion(ctx, event.id, fresh.id)).rejects.toEqual(refused("NOT_FOUND"));
  });
});
