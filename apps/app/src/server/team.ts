import "server-only";
import { notify } from "./notifications";
import { canAssignRole, canOwnerOnly, can, cleanPermissions, CoreError, hasFeature, INVITATION_TTL_MS, invitationUsable, PERMISSIONS, secretToken, sha256Hex, type Permission } from "@evoly/core";
import { Prisma } from "@evoly/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { sendEmail } from "./email/send";
import { getPlans } from "./plans";
import { effectivePlan } from "@evoly/core";

const actorPermissions = (ctx: OrgContext): Permission[] => PERMISSIONS.filter((p) => can(ctx.membership, p));
const isOwner = (ctx: OrgContext) => canOwnerOnly(ctx.membership, "OWNERSHIP_TRANSFER");

async function roleFor(ctx: OrgContext, roleId: string) {
  const role = await db.role.findFirst({ where: { id: roleId, OR: [{ organizationId: null, systemKey: { not: null } }, { organizationId: ctx.organization.id }] } });
  if (!role) throw new CoreError("NOT_FOUND");
  return role;
}

/** Onglet Membres : membres, invitations en attente, rôles attribuables par la personne connectée. */
export async function teamOverview(ctx: OrgContext, now = new Date()) {
  const [members, invitations, roles] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId: ctx.organization.id }, include: { user: { select: { id: true, name: true, email: true } }, role: { select: { id: true, name: true, systemKey: true } } }, orderBy: { joinedAt: "asc" } }),
    db.invitation.findMany({ where: { organizationId: ctx.organization.id, status: "PENDING", expiresAt: { gt: now } }, include: { role: { select: { name: true, systemKey: true } }, invitedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    db.role.findMany({ where: { OR: [{ organizationId: null, systemKey: { not: null } }, { organizationId: ctx.organization.id }] }, include: { _count: { select: { members: { where: { organizationId: ctx.organization.id } } } } }, orderBy: [{ organizationId: "asc" }, { createdAt: "asc" }] }),
  ]);
  const mine = actorPermissions(ctx);
  return { members, invitations, roles: roles.map((r) => ({ ...r, assignable: canAssignRole(mine, r) })) };
}

function invitationEmail(o: { orgName: string; inviter: string; role: string; url: string; fr: boolean }) {
  const subject = o.fr ? `${o.inviter} vous invite à rejoindre ${o.orgName} sur Evoly` : `${o.inviter} invites you to join ${o.orgName} on Evoly`;
  const body = o.fr ? `Vous êtes invité à rejoindre l’organisation ${o.orgName} avec le rôle « ${o.role} ». L’invitation est valable 48 heures.` : `You're invited to join the organisation ${o.orgName} with the “${o.role}” role. The invitation is valid for 48 hours.`;
  const cta = o.fr ? "Rejoindre l’organisation" : "Join the organisation";
  return {
    subject,
    text: `${body}\n\n${cta} : ${o.url}\n\nEvoly`,
    html: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p><p><a href="${o.url}" style="display:inline-block;background:#FFB8E8;color:#222222;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">${cta}</a></p><p style="color:#555;font-size:13px">${o.fr ? "Vous n’attendiez pas cette invitation ? Ignorez cet e-mail." : "Weren't expecting this? Ignore this email."}</p>`,
  };
}

async function sendInvitation(ctx: OrgContext, invitationId: string, token: string) {
  const inv = await db.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { role: { select: { name: true } }, organization: { select: { name: true, locale: true } } } });
  const inviter = await db.user.findUnique({ where: { id: ctx.user.id }, select: { name: true } });
  const mail = invitationEmail({ orgName: inv.organization.name, inviter: inviter?.name ?? "", role: inv.role.name, url: `${env().NEXT_PUBLIC_APP_URL}/invitations/${token}`, fr: inv.organization.locale !== "en" });
  await sendEmail({ ...mail, to: inv.email, template: "member.invitation", category: "SERVICE", organizationId: inv.organizationId });
}

/** US-ORG-02 (Pro) : invitation par e-mail avec un rôle, valable 48 heures (RG-ORG-02). */
export async function inviteMember(ctx: OrgContext, emailInput: string, roleId: string, now = new Date()) {
  if (!hasFeature(ctx.features, "TEAM_MEMBERS")) throw new CoreError("PRO_REQUIRED"); // RG-ORG-05
  const email = emailInput.trim().toLowerCase();
  const role = await roleFor(ctx, roleId);
  if (!canAssignRole(actorPermissions(ctx), role)) throw new CoreError("ROLE_NOT_ALLOWED");
  if (await db.organizationMember.findFirst({ where: { organizationId: ctx.organization.id, user: { email } } })) throw new CoreError("ALREADY_MEMBER");
  await db.invitation.updateMany({ where: { organizationId: ctx.organization.id, email, status: "PENDING" }, data: { status: "REVOKED" } });
  const token = secretToken(32);
  const inv = await db.invitation.create({ data: { organizationId: ctx.organization.id, email, roleId: role.id, tokenHash: await sha256Hex(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS), invitedById: ctx.user.id } });
  await sendInvitation(ctx, inv.id, token);
  await audit({ action: "member.invited", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Invitation", targetId: inv.id, metadata: { email, role: role.name } });
  return inv;
}

/** Renvoi : nouveau jeton et nouveau délai de 48 heures ; l'ancien lien ne fonctionne plus. */
export async function resendInvitation(ctx: OrgContext, invitationId: string, now = new Date()) {
  const inv = await db.invitation.findFirst({ where: { id: invitationId, organizationId: ctx.organization.id, status: "PENDING" } });
  if (!inv) throw new CoreError("NOT_FOUND");
  const token = secretToken(32);
  await db.invitation.update({ where: { id: inv.id }, data: { tokenHash: await sha256Hex(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) } });
  await sendInvitation(ctx, inv.id, token);
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string) {
  const done = await db.invitation.updateMany({ where: { id: invitationId, organizationId: ctx.organization.id, status: "PENDING" }, data: { status: "REVOKED" } });
  if (done.count === 0) throw new CoreError("NOT_FOUND");
  await audit({ action: "member.invitation_revoked", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Invitation", targetId: invitationId });
}

/** Page d'invitation : ce que l'invité peut voir avant d'accepter. */
export async function invitationPreview(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const inv = await db.invitation.findUnique({ where: { tokenHash: await sha256Hex(token) }, include: { organization: { select: { name: true, slug: true } }, role: { select: { name: true } }, invitedBy: { select: { name: true } } } });
  return inv ? { ...inv, usable: invitationUsable(inv, now) } : null;
}

async function orgAcceptsMembers(organizationId: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { subscription: { select: { planId: true, status: true, currentPeriodEnd: true, pastDueSince: true } } } });
  return hasFeature((await getPlans())[effectivePlan(org.subscription, new Date())].features, "TEAM_MEMBERS");
}

/** RG-ORG-02 : acceptation, à usage unique, avec un compte dont l'adresse (vérifiée) est celle de l'invitation. */
export async function acceptInvitation(userId: string, token: string, now = new Date()) {
  const preview = await invitationPreview(token, now);
  if (!preview) throw new CoreError("INVITATION_NOT_FOUND");
  if (preview.usable !== "OK") throw new CoreError(`INVITATION_${preview.usable}`);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user.emailVerified || user.email.toLowerCase() !== preview.email) throw new CoreError("INVITATION_EMAIL_MISMATCH");
  if (!(await orgAcceptsMembers(preview.organizationId))) throw new CoreError("INVITATION_UNAVAILABLE");
  await db.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({ where: { id: preview.id, status: "PENDING" }, data: { status: "ACCEPTED", acceptedAt: now } });
    if (claimed.count === 0) throw new CoreError("INVITATION_USED");
    await tx.organizationMember.upsert({ where: { organizationId_userId: { organizationId: preview.organizationId, userId } }, create: { organizationId: preview.organizationId, userId, roleId: preview.roleId, status: "ACTIVE" }, update: { roleId: preview.roleId, status: "ACTIVE" } });
  });
  await audit({ action: "member.joined", organizationId: preview.organizationId, actorUserId: userId, targetType: "Invitation", targetId: preview.id });
  await notify(preview.organizationId, "MEMBER_JOINED", { title: preview.email, body: `A rejoint l'organisation (${preview.role.name}).`, link: "/members" });
  return preview.organization.slug;
}

/** Sans compte à l'invitation : après inscription et vérification de l'adresse, l'invité rejoint automatiquement. */
export async function autoJoinPendingInvitations(userId: string, now = new Date()): Promise<string[]> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user.emailVerified) return [];
  const pending = await db.invitation.findMany({ where: { email: user.email.toLowerCase(), status: "PENDING", expiresAt: { gt: now } }, include: { organization: { select: { slug: true } } } });
  const joined: string[] = [];
  for (const inv of pending) {
    if (!(await orgAcceptsMembers(inv.organizationId))) continue;
    const claimed = await db.invitation.updateMany({ where: { id: inv.id, status: "PENDING" }, data: { status: "ACCEPTED", acceptedAt: now } });
    if (claimed.count === 0) continue;
    await db.organizationMember.upsert({ where: { organizationId_userId: { organizationId: inv.organizationId, userId } }, create: { organizationId: inv.organizationId, userId, roleId: inv.roleId }, update: { roleId: inv.roleId, status: "ACTIVE" } });
    await audit({ action: "member.joined", organizationId: inv.organizationId, actorUserId: userId, targetType: "Invitation", targetId: inv.id });
    await notify(inv.organizationId, "MEMBER_JOINED", { title: inv.email, body: "A rejoint l'organisation.", link: "/members" });
    joined.push(inv.organization.slug);
  }
  return joined;
}

async function targetMember(ctx: OrgContext, memberId: string) {
  const m = await db.organizationMember.findFirst({ where: { id: memberId, organizationId: ctx.organization.id }, include: { role: true, user: { select: { email: true } } } });
  if (!m) throw new CoreError("NOT_FOUND");
  return m;
}

/** Changement de rôle : jamais celui du propriétaire, jamais vers un rôle plus puissant que le sien. */
export async function changeMemberRole(ctx: OrgContext, memberId: string, roleId: string) {
  const m = await targetMember(ctx, memberId);
  if (m.role.systemKey === "OWNER") throw new CoreError("OWNER_ROLE_LOCKED");
  if (m.userId === ctx.user.id) throw new CoreError("ROLE_SELF_CHANGE");
  const role = await roleFor(ctx, roleId);
  const mine = actorPermissions(ctx);
  if (!canAssignRole(mine, role) || !canAssignRole(mine, m.role)) throw new CoreError("ROLE_NOT_ALLOWED");
  await db.organizationMember.update({ where: { id: m.id }, data: { roleId: role.id } });
  await audit({ action: "member.role_changed", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "OrganizationMember", targetId: m.id, metadata: { from: m.role.name, to: role.name } });
}

/** RG-ORG-01 : le propriétaire ne se retire pas ; un membre ne retire pas plus puissant que lui. */
export async function removeMember(ctx: OrgContext, memberId: string) {
  const m = await targetMember(ctx, memberId);
  if (m.role.systemKey === "OWNER") throw new CoreError("OWNER_CANNOT_BE_REMOVED");
  if (m.userId === ctx.user.id) throw new CoreError("USE_LEAVE");
  if (!canAssignRole(actorPermissions(ctx), m.role)) throw new CoreError("ROLE_NOT_ALLOWED");
  await db.organizationMember.delete({ where: { id: m.id } });
  await audit({ action: "member.removed", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "OrganizationMember", targetId: m.id, metadata: { email: m.user.email } });
}

/** Départ volontaire d'un membre ; le propriétaire doit d'abord transférer la propriété (RG-ORG-01). */
export async function leaveOrganization(ctx: OrgContext) {
  if (isOwner(ctx)) throw new CoreError("OWNER_MUST_TRANSFER");
  await db.organizationMember.deleteMany({ where: { organizationId: ctx.organization.id, userId: ctx.user.id } });
  await audit({ action: "member.left", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Organization", targetId: ctx.organization.id });
}

/** US-ORG-05 : transfert de propriété ; l'ancien propriétaire devient administrateur. Toujours un seul propriétaire. */
export async function transferOwnership(ctx: OrgContext, memberId: string) {
  if (!isOwner(ctx)) throw new CoreError("OWNER_ONLY");
  const m = await targetMember(ctx, memberId);
  if (m.userId === ctx.user.id || m.status !== "ACTIVE") throw new CoreError("TRANSFER_INVALID");
  const [ownerRole, adminRole] = await Promise.all([db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } }), db.role.findFirstOrThrow({ where: { systemKey: "ADMIN" } })]);
  await db.$transaction([
    db.organizationMember.update({ where: { id: m.id }, data: { roleId: ownerRole.id } }),
    db.organizationMember.updateMany({ where: { organizationId: ctx.organization.id, userId: ctx.user.id }, data: { roleId: adminRole.id } }),
  ]);
  await audit({ action: "organization.ownership_transferred", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "OrganizationMember", targetId: m.id, metadata: { to: m.user.email } });
}

/** US-ORG-03 (Pro) : rôle personnalisé, sans permission que son créateur n'a pas. */
export async function saveCustomRole(ctx: OrgContext, input: { id?: string | null; name: string; description?: string | null; permissions: string[] }) {
  if (!hasFeature(ctx.features, "CUSTOM_ROLES")) throw new CoreError("PRO_REQUIRED");
  const permissions = cleanPermissions(input.permissions);
  if (!permissions) throw new CoreError("ROLE_PERMISSIONS_INVALID");
  if (!canAssignRole(actorPermissions(ctx), { permissions })) throw new CoreError("ROLE_NOT_ALLOWED");
  const data = { name: input.name.trim(), description: input.description?.trim() || null, permissions };
  try {
    if (input.id) {
      const role = await db.role.findFirst({ where: { id: input.id, organizationId: ctx.organization.id } });
      if (!role) throw new CoreError("NOT_FOUND");
      return await db.role.update({ where: { id: role.id }, data });
    }
    const role = await db.role.create({ data: { ...data, organizationId: ctx.organization.id } });
    await audit({ action: "role.created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Role", targetId: role.id, metadata: { name: role.name } });
    return role;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new CoreError("ROLE_NAME_TAKEN");
    throw err;
  }
}

/** RG-ORG-03 : un rôle personnalisé utilisé par un membre (ou une invitation en attente) ne se supprime pas. */
export async function deleteCustomRole(ctx: OrgContext, roleId: string) {
  const role = await db.role.findFirst({ where: { id: roleId, organizationId: ctx.organization.id } });
  if (!role) throw new CoreError("NOT_FOUND");
  const [members, invitations] = await Promise.all([db.organizationMember.count({ where: { roleId } }), db.invitation.count({ where: { roleId, status: "PENDING" } })]);
  if (members + invitations > 0) throw new CoreError("ROLE_IN_USE");
  await db.role.delete({ where: { id: role.id } });
  await audit({ action: "role.deleted", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "Role", targetId: role.id, metadata: { name: role.name } });
}
