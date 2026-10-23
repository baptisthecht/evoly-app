import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  invitationPreview,
  inviteMember,
  resendInvitation,
  revokeInvitation,
  teamOverview,
} from "@/server/team";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("invitations de l'équipe (section 9.3)", () => {
  it("vue d'ensemble, renvoi avec un nouveau lien et un nouveau délai, révocation une seule fois, aperçu refusé pour un lien invalide", async () => {
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
    const ctx = {
      ...(await findOrgContext(owner.id, org.slug))!,
      user: { id: owner.id, name: owner.name ?? "", email: owner.email },
    };
    const email = `invite.${id}@exemple.be`;
    await inviteMember(
      ctx,
      email,
      (await db.role.findFirstOrThrow({ where: { systemKey: "MANAGER" } })).id,
    );
    expect(JSON.stringify(await teamOverview(ctx))).toContain(email);
    const inv = await db.invitation.findFirstOrThrow({
      where: { organizationId: org.id, email },
    });
    const envoyes = await db.emailMessage.count({ where: { toEmail: email } });
    await resendInvitation(ctx, inv.id, new Date(Date.now() + 60_000));
    const renvoyee = await db.invitation.findUniqueOrThrow({
      where: { id: inv.id },
    });
    expect(renvoyee.tokenHash).not.toBe(inv.tokenHash); // l'ancien lien ne fonctionne plus
    expect(renvoyee.expiresAt.getTime()).toBeGreaterThan(
      inv.expiresAt.getTime(),
    );
    expect(
      await db.emailMessage.count({ where: { toEmail: email } }),
    ).toBeGreaterThan(envoyes);
    await revokeInvitation(ctx, inv.id);
    expect(
      (await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).status,
    ).toBe("REVOKED");
    await expect(revokeInvitation(ctx, inv.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(resendInvitation(ctx, inv.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await invitationPreview("court")).toBeNull();
    expect(await invitationPreview("x".repeat(40))).toBeNull();
  });
});
