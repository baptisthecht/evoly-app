import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext, type OrgContext } from "@/server/context";
import {
  acceptInvitation,
  autoJoinPendingInvitations,
  changeMemberRole,
  deleteCustomRole,
  inviteMember,
  leaveOrganization,
  removeMember,
  saveCustomRole,
  transferOwnership,
} from "@/server/team";

const rid = () => Math.random().toString(36).slice(2, 10);
const role = (key: string) => db.role.findFirstOrThrow({ where: { systemKey: key as "OWNER" } });

async function user(email: string, verified = true) {
  return db.user.create({ data: { name: email.split("@")[0]!, email, emailVerified: verified } });
}
async function setup(plan: "free" | "pro" = "pro") {
  const id = rid();
  const owner = await user(`own.${id}@exemple.be`);
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: (await role("OWNER")).id } });
  if (plan === "pro")
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
  const ctxOf = async (userId: string) => ({ ...(await findOrgContext(userId, org.slug))!, user: { id: userId } }) as unknown as OrgContext;
  return { id, org, owner, ctxOf };
}
/** Jeton en clair d'une invitation, récupéré depuis l'e-mail envoyé. */
async function tokenFor(email: string) {
  const msg = await db.emailMessage.findFirstOrThrow({ where: { toEmail: email, template: "member.invitation" }, orderBy: { queuedAt: "desc" } });
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json") && x.includes(msg.id))) {
    const m = JSON.parse(await readFile(`${dir}/${f}`, "utf8")) as { text: string };
    return /\/invitations\/([A-Za-z0-9_-]+)/.exec(m.text)![1]!;
  }
  throw new Error("e-mail introuvable");
}

describe("membres et rôles (section 9.3)", () => {
  it("invitation réservée au Pro, anti-escalade, acceptation à usage unique avec la bonne adresse", async () => {
    const free = await setup("free");
    await expect(inviteMember(await free.ctxOf(free.owner.id), `x.${free.id}@exemple.be`, (await role("ADMIN")).id)).rejects.toThrow("PRO_REQUIRED");

    const s = await setup();
    const owner = await s.ctxOf(s.owner.id);
    const email = `sam.${s.id}@exemple.be`;
    await inviteMember(owner, email.toUpperCase(), (await role("MANAGER")).id);
    const token = await tokenFor(email);
    const stranger = await user(`autre.${s.id}@exemple.be`);
    await expect(acceptInvitation(stranger.id, token)).rejects.toThrow("INVITATION_EMAIL_MISMATCH");
    const sam = await user(email);
    expect(await acceptInvitation(sam.id, token)).toBe(s.org.slug);
    await expect(acceptInvitation(sam.id, token)).rejects.toThrow("INVITATION_USED");
    const samCtx = await s.ctxOf(sam.id);
    expect(samCtx.membership.systemRole).toBe("MANAGER");

    // un gestionnaire avec la gestion des membres ne peut pas donner plus de droits qu'il n'en a
    const custom = await saveCustomRole(owner, { name: "Équipe accueil", permissions: ["MEMBERS_MANAGE", "CHECKIN_SCAN", "ORDERS_VIEW"] });
    const lea = await user(`lea.${s.id}@exemple.be`);
    await db.organizationMember.create({ data: { organizationId: s.org.id, userId: lea.id, roleId: custom.id } });
    const leaCtx = await s.ctxOf(lea.id);
    await expect(inviteMember(leaCtx, `new.${s.id}@exemple.be`, (await role("ADMIN")).id)).rejects.toThrow("ROLE_NOT_ALLOWED");
    await expect(inviteMember(leaCtx, `new.${s.id}@exemple.be`, (await role("SCANNER")).id)).resolves.toBeTruthy();
    await expect(saveCustomRole(leaCtx, { name: "Pirate", permissions: ["FINANCE_VIEW"] })).rejects.toThrow("ROLE_NOT_ALLOWED"); // pas de rôle plus puissant que soi
    const member = await db.organizationMember.findFirstOrThrow({ where: { organizationId: s.org.id, userId: sam.id } });
    await expect(changeMemberRole(leaCtx, member.id, (await role("SCANNER")).id)).rejects.toThrow("ROLE_NOT_ALLOWED"); // plus puissant qu'elle
  });

  it("invitation expirée ; inscription puis adhésion automatique", async () => {
    const s = await setup();
    const owner = await s.ctxOf(s.owner.id);
    const email = `tom.${s.id}@exemple.be`;
    const inv = await inviteMember(owner, email, (await role("SCANNER")).id);
    await db.invitation.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const tom = await user(email);
    await expect(acceptInvitation(tom.id, await tokenFor(email))).rejects.toThrow("INVITATION_EXPIRED");
    expect(await autoJoinPendingInvitations(tom.id)).toEqual([]);
    await inviteMember(owner, email, (await role("SCANNER")).id);
    expect(await autoJoinPendingInvitations(tom.id)).toEqual([s.org.slug]);
    expect((await s.ctxOf(tom.id)).membership.systemRole).toBe("SCANNER");
  });

  it("propriétaire protégé, départ, transfert de propriété, rôle utilisé non supprimable", async () => {
    const s = await setup();
    const owner = await s.ctxOf(s.owner.id);
    const ownerMember = await db.organizationMember.findFirstOrThrow({ where: { organizationId: s.org.id, userId: s.owner.id } });
    const admin = await user(`adm.${s.id}@exemple.be`);
    const adminMember = await db.organizationMember.create({ data: { organizationId: s.org.id, userId: admin.id, roleId: (await role("ADMIN")).id } });
    const adminCtx = await s.ctxOf(admin.id);
    await expect(removeMember(adminCtx, ownerMember.id)).rejects.toThrow("OWNER_CANNOT_BE_REMOVED");
    await expect(changeMemberRole(adminCtx, ownerMember.id, (await role("VIEWER")).id)).rejects.toThrow("OWNER_ROLE_LOCKED");
    await expect(leaveOrganization(owner)).rejects.toThrow("OWNER_MUST_TRANSFER");
    await expect(transferOwnership(adminCtx, ownerMember.id)).rejects.toThrow("OWNER_ONLY");
    await transferOwnership(owner, adminMember.id);
    expect((await s.ctxOf(admin.id)).membership.systemRole).toBe("OWNER");
    expect((await s.ctxOf(s.owner.id)).membership.systemRole).toBe("ADMIN");
    expect(await db.organizationMember.count({ where: { organizationId: s.org.id, role: { systemKey: "OWNER" } } })).toBe(1);
    const custom = await saveCustomRole(await s.ctxOf(admin.id), { name: "Presse", permissions: ["ORDERS_VIEW"] });
    const viewer = await user(`presse.${s.id}@exemple.be`);
    const vm = await db.organizationMember.create({ data: { organizationId: s.org.id, userId: viewer.id, roleId: custom.id } });
    await expect(deleteCustomRole(await s.ctxOf(admin.id), custom.id)).rejects.toThrow("ROLE_IN_USE");
    await removeMember(await s.ctxOf(admin.id), vm.id);
    await deleteCustomRole(await s.ctxOf(admin.id), custom.id);
    expect(await findOrgContext(viewer.id, s.org.slug)).toBeNull();
  });
});
