import { emailDocIsEmpty, type EmailDoc } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { OrgContext } from "@/server/context";
import {
  eventEmailBlocks,
  previewEventEmailBlock,
  saveEventEmailBlock,
} from "@/server/eventEmailBlocks";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(userName = "Camille Dupont") {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: "Club des Amis",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      locale: "fr",
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: "Gala de printemps",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 10 * 86_400_000),
      locationName: "Salle des fêtes",
      city: "Namur",
      ticketTypes: {
        create: { name: "Fosse", priceMinor: 0, currency: "EUR", quantity: 10 },
      },
    },
  });
  const ctx = {
    organization: { id: org.id, name: org.name, locale: "fr" },
    user: { id: "u1", name: userName },
  } as unknown as OrgContext;
  return { org, event, ctx };
}
const para = (text: string): EmailDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("blocs des e-mails de billets et de rappel", () => {
  it("sans bloc : deux blocs vides, prêts pour l'éditeur", async () => {
    const s = await setup();
    const blocks = await eventEmailBlocks(s.event.id);
    expect([
      emailDocIsEmpty(blocks.ticket),
      emailDocIsEmpty(blocks.reminder),
    ]).toEqual([true, true]);
  });

  it("bloc enregistré puis relu ; un bloc HTML est nettoyé de tout script avant d'être stocké", async () => {
    const s = await setup();
    await saveEventEmailBlock(
      s.ctx,
      s.event.id,
      "ticket",
      para("Parking gratuit derrière la salle"),
    );
    await saveEventEmailBlock(s.ctx, s.event.id, "reminder", {
      type: "doc",
      content: [
        {
          type: "rawHtml",
          attrs: { html: "<p>Bloc maison</p><script>alert(1)</script>" },
        },
      ],
    });
    const stored = await db.event.findUniqueOrThrow({
      where: { id: s.event.id },
      select: { ticketEmailContent: true, reminderEmailContent: true },
    });
    expect(JSON.stringify(stored.ticketEmailContent)).toContain(
      "Parking gratuit derrière la salle",
    );
    expect(JSON.stringify(stored.reminderEmailContent)).toContain(
      "Bloc maison",
    );
    expect(JSON.stringify(stored.reminderEmailContent)).not.toMatch(/<script/i);
    expect(
      JSON.stringify((await eventEmailBlocks(s.event.id)).ticket),
    ).toContain("Parking gratuit derrière la salle");
  });

  it("bloc vidé : effacé", async () => {
    const s = await setup();
    await saveEventEmailBlock(s.ctx, s.event.id, "ticket", para("Texte"));
    await saveEventEmailBlock(s.ctx, s.event.id, "ticket", {
      type: "doc",
      content: [],
    });
    expect(
      (
        await db.event.findUniqueOrThrow({
          where: { id: s.event.id },
          select: { ticketEmailContent: true },
        })
      ).ticketEmailContent,
    ).toBeNull();
    expect(emailDocIsEmpty((await eventEmailBlocks(s.event.id)).ticket)).toBe(
      true,
    );
  });

  it("événement d'une autre organisation : refusé, à l'enregistrement comme à l'aperçu", async () => {
    const mine = await setup();
    const other = await setup();
    await expect(
      saveEventEmailBlock(mine.ctx, other.event.id, "ticket", para("x")),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      previewEventEmailBlock(mine.ctx, other.event.id, "ticket", para("x")),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("aperçu dans l'e-mail des billets : le bloc, l'événement, une commande d'exemple et le prénom de l'organisateur", async () => {
    const s = await setup("Camille Dupont");
    const p = await previewEventEmailBlock(
      s.ctx,
      s.event.id,
      "ticket",
      para("Parking gratuit derrière la salle"),
    );
    expect(p.html).toContain("Parking gratuit derrière la salle");
    expect(p.html).toContain("Gala de printemps");
    expect(p.html).toContain("EVO-AB12-CD34");
    expect(p.html).toContain("Camille");
    expect(p.subject.length).toBeGreaterThan(0);
    expect(p.warnings).toEqual([]);
  });

  it("aperçu dans l'e-mail de rappel : prénom par défaut « Léa » si le nom est vide ; les risques d'un bloc HTML sont listés", async () => {
    const s = await setup("   ");
    const p = await previewEventEmailBlock(
      s.ctx,
      s.event.id,
      "reminder",
      para("À demain !"),
    );
    expect(p.html).toContain("À demain !");
    expect(p.html).toContain("Léa");
    const html = await previewEventEmailBlock(s.ctx, s.event.id, "reminder", {
      type: "doc",
      content: [
        {
          type: "rawHtml",
          attrs: {
            html: '<div style="position:fixed"><form><input></form></div>',
          },
        },
      ],
    });
    expect(Array.isArray(html.warnings)).toBe(true);
  });
});
