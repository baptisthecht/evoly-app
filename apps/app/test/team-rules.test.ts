import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { acceptInvitation, inviteMember, leaveOrganization, removeMember, changeMemberRole, saveCustomRole, transferOwnership } from "@/server/team";

// équipe (RG-ORG-05) : invitations, acceptation, rôle du propriétaire, retrait, départ, transmission, rôles personnalisés
const rid = () => Math.random().toString(36).slice(2, 10);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function setup(o: { pro?: boolean } = {}) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  const ownerMember = await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (o.pro !== false)
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) },
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const other = await db.role.findFirstOrThrow({ where: { systemKey: { not: null }, NOT: { systemKey: "OWNER" } } });
  return { ctx, org, owner, ownerMember, other, id };
}
async function member(organizationId: string, roleId: string) {
  const u = await db.user.create({ data: { name: "Tom Dubois", email: `tom.${rid()}@exemple.be`, emailVerified: true } });
  const m = await db.organizationMember.create({ data: { organizationId, userId: u.id, roleId, status: "ACTIVE" } });
  return { user: u, member: m };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("équipe : invitations", () => {
  it("offre gratuite refusée ; membre existant refusé ; une nouvelle invitation annule la précédente", async () => {
    const free = await setup({ pro: false });
    await expect(inviteMember(free.ctx, "lea@exemple.be", free.other.id)).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx, org, owner, other, id } = await setup();
    await expect(inviteMember(ctx, ` ${owner.email.toUpperCase()} `, other.id)).rejects.toEqual(refused("ALREADY_MEMBER"));
    const first = await inviteMember(ctx, `lea.${id}@exemple.be`, other.id);
    const second = await inviteMember(ctx, `Lea.${id}@Exemple.be`, other.id);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("REVOKED");
    expect((await db.invitation.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("PENDING");
    expect(await db.invitation.count({ where: { organizationId: org.id, status: "PENDING" } })).toBe(1);
  });

  it("acceptation : lien invalide refusé ; autre compte ou adresse non vérifiée refusés ; une seule fois", async () => {
    const { org, owner, other, id } = await setup();
    const token = `jeton-${rid()}-${rid()}-${rid()}`;
    const email = `lea.${id}@exemple.be`;
    await db.invitation.create({
      data: { organizationId: org.id, email, roleId: other.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + 86_400_000), invitedById: owner.id },
    });
    const intruder = await db.user.create({ data: { name: "Intrus", email: `intrus.${id}@exemple.be`, emailVerified: true } });
    const unverified = await db.user.create({ data: { name: "Léa", email: `LEA.${id}@exemple.be`.replace("LEA", "lea2"), emailVerified: false } });
    const lea = await db.user.create({ data: { name: "Léa Martin", email, emailVerified: true } });
    await expect(acceptInvitation(lea.id, "court")).rejects.toEqual(refused("INVITATION_NOT_FOUND"));
    await expect(acceptInvitation(intruder.id, token)).rejects.toEqual(refused("INVITATION_EMAIL_MISMATCH"));
    await expect(acceptInvitation(unverified.id, token)).rejects.toEqual(refused("INVITATION_EMAIL_MISMATCH"));
    await acceptInvitation(lea.id, token);
    expect(await db.organizationMember.findFirstOrThrow({ where: { organizationId: org.id, userId: lea.id } })).toMatchObject({
      status: "ACTIVE",
      roleId: other.id,
    });
    await expect(acceptInvitation(lea.id, token)).rejects.toEqual(expect.objectContaining({ code: expect.stringMatching(/^INVITATION_/) }));
  });
});

describe("équipe : propriétaire, membres, rôles", () => {
  it("propriétaire : rôle verrouillé, jamais retiré, ne part pas sans transmettre ; membre retiré ; transmission", async () => {
    const { ctx, org, ownerMember, other } = await setup();
    await expect(changeMemberRole(ctx, ownerMember.id, other.id)).rejects.toEqual(refused("OWNER_ROLE_LOCKED"));
    await expect(removeMember(ctx, ownerMember.id)).rejects.toEqual(refused("OWNER_CANNOT_BE_REMOVED"));
    await expect(leaveOrganization(ctx)).rejects.toEqual(refused("OWNER_MUST_TRANSFER"));
    await expect(transferOwnership(ctx, ownerMember.id)).rejects.toEqual(refused("TRANSFER_INVALID"));
    const tom = await member(org.id, other.id);
    await removeMember(ctx, tom.member.id);
    expect(await db.organizationMember.count({ where: { id: tom.member.id, status: "ACTIVE" } })).toBe(0);
    const ines = await member(org.id, other.id);
    await transferOwnership(ctx, ines.member.id);
    const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
    expect((await db.organizationMember.findUniqueOrThrow({ where: { id: ines.member.id } })).roleId).toBe(ownerRole.id);
  });

  it("rôle personnalisé : réservé au Pro ; permissions invalides refusées", async () => {
    const free = await setup({ pro: false });
    await expect(saveCustomRole(free.ctx, { name: "Billetterie", permissions: ["orders.read"] })).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx } = await setup();
    await expect(saveCustomRole(ctx, { name: "Billetterie", permissions: ["permission.inexistante"] })).rejects.toEqual(refused("ROLE_PERMISSIONS_INVALID"));
  });
});
