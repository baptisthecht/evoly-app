"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { revalidatePath } from "next/cache";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { z } from "zod";

// ─────────────────────────────────────────
// INVITATIONS
// ─────────────────────────────────────────

export async function inviteMemberAction(
	organizationId: string,
	formData: FormData,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "MEMBERS_INVITE");

	const email = (formData.get("email") as string)?.toLowerCase().trim();
	const roleId = formData.get("roleId") as string;

	if (!email || !z.string().email().safeParse(email).success) {
		return { error: "Email invalide." };
	}
	if (!roleId) return { error: "Rôle requis." };

	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { name: true, slug: true },
	});
	if (!org) return { error: "Organisation introuvable." };

	// Check already member
	const existingUser = await db.user.findUnique({ where: { email } });
	if (existingUser) {
		const isMember = await db.organizationMember.findUnique({
			where: {
				organizationId_userId: { organizationId, userId: existingUser.id },
			},
		});
		if (isMember) return { error: "Cet utilisateur est déjà membre." };
	}

	// Check existing pending invitation
	const existing = await db.invitation.findFirst({
		where: { organizationId, email, status: "PENDING" },
	});
	if (existing)
		return { error: "Une invitation est déjà en attente pour cet email." };

	const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

	const invitation = await db.invitation.create({
		data: {
			organizationId,
			email,
			roleId,
			expiresAt,
			createdBy: session.user.id,
		},
	});

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
	const inviteUrl = `${appUrl}/invite/${invitation.token}`;

	try {
		await resend.emails.send({
			from: FROM_EMAIL,
			to: email,
			subject: `Invitation à rejoindre ${org.name} sur Evoly`,
			html: `
        <p>Bonjour,</p>
        <p>Vous avez été invité(e) à rejoindre l'organisation <strong>${org.name}</strong> sur Evoly.</p>
        <p>Cette invitation expire dans 48 heures.</p>
        <p><a href="${inviteUrl}" style="background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Accepter l'invitation →
        </a></p>
        <p style="font-size:12px;color:#9ca3af">Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
      `,
		});
	} catch (e) {
		console.error("[inviteMemberAction] Email error:", e);
	}

	revalidatePath(`/dashboard/${org.slug}/members`);
	return { success: true };
}

export async function cancelInvitationAction(
	invitationId: string,
	organizationId: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "MEMBERS_INVITE");

	await db.invitation.update({
		where: { id: invitationId, organizationId },
		data: { status: "CANCELLED" },
	});

	revalidatePath(`/dashboard`);
	return { success: true };
}

export async function resendInvitationAction(
	invitationId: string,
	organizationId: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "MEMBERS_INVITE");

	const invitation = await db.invitation.findUnique({
		where: { id: invitationId, organizationId },
		include: { organization: { select: { name: true, slug: true } } },
	});
	if (!invitation) return { error: "Invitation introuvable." };

	const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
	const newToken = crypto.randomUUID();

	await db.invitation.update({
		where: { id: invitationId },
		data: { expiresAt: newExpiry, token: newToken, status: "PENDING" },
	});

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
	try {
		await resend.emails.send({
			from: FROM_EMAIL,
			to: invitation.email,
			subject: `Rappel — Invitation à rejoindre ${invitation.organization.name}`,
			html: `<p>Votre invitation à rejoindre <strong>${invitation.organization.name}</strong> sur Evoly est toujours valide.</p>
        <p><a href="${appUrl}/invite/${newToken}">Accepter l'invitation →</a></p>`,
		});
	} catch (e) {
		console.error("[resendInvitationAction] Email error:", e);
	}

	return { success: true };
}

// ─────────────────────────────────────────
// ACCEPT INVITATION
// ─────────────────────────────────────────

export async function acceptInvitationAction(token: string) {
	const session = await auth();
	if (!session?.user)
		return {
			error: "Connectez-vous pour accepter l'invitation.",
			requireLogin: true,
		};

	const invitation = await db.invitation.findUnique({
		where: { token },
		include: { organization: { select: { id: true, slug: true, name: true } } },
	});

	if (!invitation) return { error: "Invitation introuvable." };
	if (invitation.status !== "PENDING")
		return { error: "Cette invitation n'est plus valide." };
	if (invitation.expiresAt < new Date()) {
		await db.invitation.update({
			where: { id: invitation.id },
			data: { status: "EXPIRED" },
		});
		return { error: "Cette invitation a expiré." };
	}
	if (invitation.email !== session.user.email) {
		return {
			error: "Cette invitation est destinée à une autre adresse email.",
		};
	}

	// Check already member
	const isMember = await db.organizationMember.findUnique({
		where: {
			organizationId_userId: {
				organizationId: invitation.organizationId,
				userId: session.user.id,
			},
		},
	});
	if (isMember) {
		await db.invitation.update({
			where: { id: invitation.id },
			data: { status: "ACCEPTED" },
		});
		return { success: true, orgSlug: invitation.organization.slug };
	}

	await db.$transaction([
		db.organizationMember.create({
			data: {
				organizationId: invitation.organizationId,
				userId: session.user.id,
				roleId: invitation.roleId,
			},
		}),
		db.invitation.update({
			where: { id: invitation.id },
			data: { status: "ACCEPTED" },
		}),
	]);

	return { success: true, orgSlug: invitation.organization.slug };
}

// ─────────────────────────────────────────
// MANAGE MEMBERS
// ─────────────────────────────────────────

export async function changeMemberRoleAction(
	memberId: string,
	organizationId: string,
	newRoleId: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(
		session.user.id,
		organizationId,
		"MEMBERS_MANAGE_ROLES",
	);

	const member = await db.organizationMember.findUnique({
		where: { id: memberId },
		include: { role: { select: { name: true } } },
	});
	if (!member || member.organizationId !== organizationId) {
		return { error: "Membre introuvable." };
	}

	// Can't demote last admin
	if (member.role.name === "Admin") {
		const adminCount = await db.organizationMember.count({
			where: { organizationId, role: { name: "Admin" } },
		});
		if (adminCount <= 1) {
			return { error: "Impossible : ce membre est le seul Admin." };
		}
	}

	await db.organizationMember.update({
		where: { id: memberId },
		data: { roleId: newRoleId },
	});

	revalidatePath(`/dashboard`);
	return { success: true };
}

export async function removeMemberAction(
	memberId: string,
	organizationId: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "MEMBERS_REMOVE");

	const member = await db.organizationMember.findUnique({
		where: { id: memberId },
		include: { role: { select: { name: true } } },
	});
	if (!member || member.organizationId !== organizationId) {
		return { error: "Membre introuvable." };
	}

	// Prevent removing last admin
	if (member.role.name === "Admin") {
		const adminCount = await db.organizationMember.count({
			where: { organizationId, role: { name: "Admin" } },
		});
		if (adminCount <= 1) {
			return {
				error: "Impossible de retirer le seul Admin de l'organisation.",
			};
		}
	}

	// Prevent self-removal if last admin
	if (member.userId === session.user.id && member.role.name === "Admin") {
		return {
			error:
				"Vous ne pouvez pas vous retirer vous-même en tant que dernier Admin.",
		};
	}

	await db.organizationMember.delete({ where: { id: memberId } });

	revalidatePath(`/dashboard`);
	return { success: true };
}

// ─────────────────────────────────────────
// ROLES
// ─────────────────────────────────────────

export async function createRoleAction(
	organizationId: string,
	formData: FormData,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "ROLES_CREATE");

	const name = (formData.get("name") as string)?.trim();
	if (!name) return { error: "Nom du rôle requis." };

	const permissionsRaw = formData.getAll("permissions") as string[];

	const role = await db.role.create({
		data: { organizationId, name, permissions: permissionsRaw as any },
	});

	revalidatePath(`/dashboard`);
	return { success: true, roleId: role.id };
}

export async function updateRoleAction(
	roleId: string,
	organizationId: string,
	formData: FormData,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "ROLES_EDIT");

	const role = await db.role.findUnique({ where: { id: roleId } });
	if (!role || role.organizationId !== organizationId)
		return { error: "Rôle introuvable." };
	if (role.isSystem)
		return { error: "Les rôles système ne peuvent pas être modifiés." };

	const name = (formData.get("name") as string)?.trim();
	const permissionsRaw = formData.getAll("permissions") as string[];

	await db.role.update({
		where: { id: roleId },
		data: { name, permissions: permissionsRaw as any },
	});

	revalidatePath(`/dashboard`);
	return { success: true };
}

export async function deleteRoleAction(roleId: string, organizationId: string) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "ROLES_DELETE");

	const role = await db.role.findUnique({
		where: { id: roleId },
		include: { _count: { select: { members: true } } },
	});
	if (!role || role.organizationId !== organizationId)
		return { error: "Rôle introuvable." };
	if (role.isSystem)
		return { error: "Les rôles système ne peuvent pas être supprimés." };
	if (role._count.members > 0) {
		return {
			error: `Ce rôle est utilisé par ${role._count.members} membre(s). Réaffectez-les d'abord.`,
		};
	}

	await db.role.delete({ where: { id: roleId } });

	revalidatePath(`/dashboard`);
	return { success: true };
}

// ─────────────────────────────────────────
// INVITE CODE — Rejoindre via code court (onboarding)
// ─────────────────────────────────────────

// Vérifie si un code court (8 premiers chars du token en majuscules) est valide
export async function checkInviteCodeAction(code: string) {
	const invitation = await db.invitation.findFirst({
		where: {
			status: "PENDING",
			expiresAt: { gt: new Date() },
		},
		select: {
			token: true,
			organization: { select: { name: true } },
		},
	});

	// Chercher parmi toutes les invitations valides celle dont le code correspond
	const allInvitations = await db.invitation.findMany({
		where: {
			status: "PENDING",
			expiresAt: { gt: new Date() },
		},
		select: {
			token: true,
			organization: { select: { name: true } },
		},
	});

	const match = allInvitations.find(
		(inv) => inv.token.substring(0, 8).toUpperCase() === code.substring(0, 8).toUpperCase()
	);

	if (!match) return { valid: false };
	return { valid: true, orgName: match.organization.name };
}

// Accepte une invitation via code court — appelé après connexion/inscription
export async function acceptInvitationByCodeAction(code: string) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	const allInvitations = await db.invitation.findMany({
		where: {
			status: "PENDING",
			expiresAt: { gt: new Date() },
		},
		include: {
			organization: {
				select: { id: true, slug: true },
			},
		},
	});

	const invitation = allInvitations.find(
		(inv) => inv.token.substring(0, 8).toUpperCase() === code.substring(0, 8).toUpperCase()
	);

	if (!invitation) return { error: "Code invalide ou expiré." };
	if (invitation.email.toLowerCase() !== session.user.email?.toLowerCase()) {
		return { error: "Ce code d'invitation ne correspond pas à votre adresse email." };
	}

	// Check user not already member
	const existing = await db.organizationMember.findUnique({
		where: {
			organizationId_userId: {
				organizationId: invitation.organizationId,
				userId: session.user.id,
			},
		},
	});
	if (existing) return { error: "Vous êtes déjà membre de cette organisation." };

	await db.$transaction([
		db.organizationMember.create({
			data: {
				organizationId: invitation.organizationId,
				userId: session.user.id,
				roleId: invitation.roleId,
			},
		}),
		db.invitation.update({
			where: { id: invitation.id },
			data: { status: "ACCEPTED" },
		}),
	]);

	revalidatePath("/dashboard");
	return { success: true, orgSlug: invitation.organization.slug };
}
