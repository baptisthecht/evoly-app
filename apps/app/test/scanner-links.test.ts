import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { listScannerLinks, personalScannerLink, scannerUrl } from "@/server/scanner";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("liens de scanner (US-SCN-06)", () => {
  it("adresse du scanner ; lien personnel d'un membre, réutilisé tant qu'il est valide ; liste des liens", async () => {
    const id = rid();
    const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
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
    const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
    const url = scannerUrl("lien-test");
    expect(url).toMatch(/^https?:\/\/scanner\..+\/s\/.+/);
    const a = await personalScannerLink(ctx, event.id);
    const b = await personalScannerLink(ctx, event.id);
    expect(b.id).toBe(a.id); // le même lien tant qu'il est valide
    expect(a.createdById).toBe(owner.id);
    expect(Array.isArray(await listScannerLinks(ctx, event.id))).toBe(true);
  });
});
