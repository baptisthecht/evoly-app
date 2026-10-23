import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  eventEmailBlocks,
  previewEventEmailBlock,
  saveEventEmailBlock,
} from "@/server/eventEmailBlocks";

const rid = () => Math.random().toString(36).slice(2, 10);
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("bloc personnalisé des e-mails d'un événement (section 9.18)", () => {
  it("enregistré nettoyé, effacé s'il est vide, prévisualisé dans le vrai e-mail", async () => {
    const id = rid();
    const owner = await db.user.create({
      data: {
        name: "Camille Dupont",
        email: `own.${id}@exemple.be`,
        emailVerified: true,
      },
    });
    const org = await db.organization.create({
      data: {
        name: `Club ${id}`,
        slug: `club-${id}`,
        subdomain: `club-${id}`,
        country: "BE",
        currency: "EUR",
        timezone: "Europe/Brussels",
        locale: "fr",
      },
    });
    const ownerRole = await db.role.findFirstOrThrow({
      where: { systemKey: "OWNER" },
    });
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: "ACTIVE",
      },
    });
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE" },
    });
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
      },
    });
    const ctx = {
      ...(await findOrgContext(owner.id, org.slug))!,
      user: { id: owner.id, name: owner.name ?? "", email: owner.email },
    };
    await saveEventEmailBlock(
      ctx,
      event.id,
      "ticket",
      doc("Parking gratuit derrière la salle\u0007"),
    );
    const blocs = await eventEmailBlocks(event.id);
    expect(JSON.stringify(blocs.ticket)).toContain(
      "Parking gratuit derrière la salle",
    );
    expect(JSON.stringify(blocs.ticket)).not.toContain("\\u0007"); // caractère de contrôle retiré
    const apercu = await previewEventEmailBlock(
      ctx,
      event.id,
      "reminder",
      doc("Pensez à votre pièce d'identité"),
    );
    expect(JSON.stringify(apercu)).toContain("Pensez à votre pièce d");
    await saveEventEmailBlock(ctx, event.id, "ticket", doc("   "));
    expect(
      JSON.stringify((await eventEmailBlocks(event.id)).ticket),
    ).not.toContain("Parking");
  });
});
