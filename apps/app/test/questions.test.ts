import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { publicQuestions, removeQuestion, saveQuestion } from "@/server/questions";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 9 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: {
        create: [
          { name: "Fosse", priceMinor: 0, currency: "EUR", quantity: 50, sortOrder: 0 },
          { name: "VIP", priceMinor: 0, currency: "EUR", quantity: 10, sortOrder: 1 },
        ],
      },
    },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
  });
  const ctx = { organization: { id: org.id }, user: { id: user.id } } as unknown as OrgContext;
  return { id, org, event, ctx, fosse: event.ticketTypes[0]!, vip: event.ticketTypes[1]! };
}
const buyer = (id: string) => ({ firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });

describe("questions à l'achat (US-QST-01, RG-QST-03)", () => {
  it("obligatoires vérifiées côté serveur ; réponses par billet rattachées aux bons billets", async () => {
    const s = await setup();
    const q1 = await saveQuestion(s.ctx, s.event.id, null, {
      label: "Comment nous avez-vous connus ?",
      type: "TEXT",
      required: true,
      scope: "ORDER",
      ticketTypeIds: [],
    });
    const q2 = await saveQuestion(s.ctx, s.event.id, null, {
      label: "Régime alimentaire",
      type: "SELECT",
      options: "Aucun\nVégétarien",
      required: true,
      scope: "TICKET",
      ticketTypeIds: [s.vip.id],
    });
    await expect(saveQuestion(s.ctx, s.event.id, null, { label: "Taille", type: "SELECT", options: "M", scope: "ORDER" })).rejects.toThrow("QUESTION_OPTIONS");
    const r = await reserveOrder({
      eventId: s.event.id,
      lines: [
        { ticketTypeId: s.fosse.id, quantity: 1 },
        { ticketTypeId: s.vip.id, quantity: 2 },
      ],
      locale: "fr",
    });
    const vipItem = (await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId, ticketTypeId: s.vip.id } })).id;
    await expect(submitBuyer(r.token, { ...buyer(s.id), answers: { order: {}, tickets: {} } })).rejects.toThrow("ANSWERS_INVALID");
    await expect(
      submitBuyer(r.token, {
        ...buyer(s.id),
        answers: { order: { [q1.id]: "Instagram" }, tickets: { [vipItem]: [{ [q2.id]: "Végétarien" }, { [q2.id]: "Carnivore" }] } },
      }),
    ).rejects.toThrow("ANSWERS_INVALID");
    await submitBuyer(r.token, {
      ...buyer(s.id),
      answers: { order: { [q1.id]: "Instagram" }, tickets: { [vipItem]: [{ [q2.id]: "Végétarien" }, { [q2.id]: "Aucun" }] } },
    });
    const answers = await db.questionAnswer.findMany({
      where: { orderId: r.orderId },
      include: { ticket: { select: { orderItemId: true, createdAt: true } } },
    });
    expect(answers).toHaveLength(3);
    expect(answers.find((a) => a.questionId === q1.id)?.ticketId).toBeNull();
    const perTicket = answers.filter((a) => a.questionId === q2.id);
    expect(perTicket.every((a) => a.ticket?.orderItemId === vipItem)).toBe(true);
    expect(new Set(perTicket.map((a) => a.ticketId)).size).toBe(2);
    expect(perTicket.map((a) => (a.value as { value: string }).value).sort()).toEqual(["Aucun", "Végétarien"]);
  });

  it("supprimée sans réponse, archivée sinon ; une question archivée n'est plus posée", async () => {
    const s = await setup();
    const unused = await saveQuestion(s.ctx, s.event.id, null, { label: "Question inutile", type: "TEXT", scope: "ORDER" });
    expect(await removeQuestion(s.ctx, s.event.id, unused.id)).toBe("DELETED");
    const q = await saveQuestion(s.ctx, s.event.id, null, { label: "Accepte le règlement", type: "CHECKBOX", required: true, scope: "ORDER" });
    const r = await reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.fosse.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { ...buyer(s.id), answers: { order: { [q.id]: true } } });
    await expect(saveQuestion(s.ctx, s.event.id, q.id, { label: "Accepte le règlement", type: "TEXT", scope: "ORDER" })).rejects.toThrow(
      "QUESTION_TYPE_LOCKED",
    );
    expect(await removeQuestion(s.ctx, s.event.id, q.id)).toBe("ARCHIVED");
    expect(await db.questionAnswer.count({ where: { questionId: q.id } })).toBe(1);
    expect(await publicQuestions(s.event.id)).toEqual([]);
  });
});
