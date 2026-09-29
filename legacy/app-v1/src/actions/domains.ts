"use server";

import { db } from "@evoly/db";
import { auth } from "@/lib/auth";
import { requirePermission } from "@evoly/core/organizers";
import { deprovisionDomain, provisionDomain } from "@evoly/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import dns from "node:dns/promises";

// Slugs réservés
const RESERVED_SLUGS = new Set([
	"app",
	"api",
	"www",
	"scanner",
	"admin",
	"mail",
	"support",
	"blog",
	"help",
	"docs",
	"status",
	"evoly",
	"billing",
	"login",
]);

// ─────────────────────────────────────────
// SOUS-DOMAINE ORG
// ─────────────────────────────────────────

export async function checkSubdomainAvailabilityAction(
	slug: string,
	organizationId: string,
) {
	if (!slug || slug.length < 3 || slug.length > 50) {
		return { available: false, error: "Entre 3 et 50 caractères." };
	}
	if (!/^[a-z0-9-]+$/.test(slug)) {
		return {
			available: false,
			error: "Lettres minuscules, chiffres et tirets uniquement.",
		};
	}
	if (RESERVED_SLUGS.has(slug)) {
		return { available: false, error: "Ce sous-domaine est réservé." };
	}

	const existing = await db.organization.findFirst({
		where: { slug, id: { not: organizationId } },
	});

	return { available: !existing };
}

export async function updateSubdomainAction(
	organizationId: string,
	newSlug: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "SETTINGS_EDIT");

	const check = await checkSubdomainAvailabilityAction(newSlug, organizationId);
	if (!check.available)
		return { error: check.error ?? "Sous-domaine non disponible." };

	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { slug: true },
	});
	if (!org) return { error: "Organisation introuvable." };

	await db.organization.update({
		where: { id: organizationId },
		data: {
			slug: newSlug,
			previousSubdomain: org.slug,
			subdomainChangedAt: new Date(),
		},
	});

	revalidatePath("/dashboard");
	return { success: true, newSlug };
}

// ─────────────────────────────────────────
// DOMAINE CUSTOM
// ─────────────────────────────────────────

export async function addCustomDomainAction(
	organizationId: string,
	domain: string,
	eventId?: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "SETTINGS_EDIT");

	// Check Pro plan
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { planId: true },
	});
	if (org?.planId !== "pro")
		return { error: "Les domaines custom sont réservés au plan Pro." };

	// Validate domain format
	const domainSchema = z
		.string()
		.regex(
			/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
			"Format de domaine invalide.",
		);
	const parsed = domainSchema.safeParse(domain.toLowerCase().trim());
	if (!parsed.success) return { error: "Format de domaine invalide." };

	// Max 10 domaines custom par org
	const count = await db.customDomain.count({ where: { organizationId } });
	if (count >= 10)
		return { error: "Maximum 10 domaines custom par organisation." };

	// Check not already used
	const existing = await db.customDomain.findUnique({
		where: { domain: parsed.data },
	});
	if (existing) return { error: "Ce domaine est déjà utilisé." };

	const customDomain = await db.customDomain.create({
		data: {
			organizationId,
			domain: parsed.data,
			eventId: eventId ?? null,
			scope: eventId ? "EVENT" : "ORGANIZATION",
			status: "PENDING",
			sslStatus: "PENDING",
		},
	});

	// Après validation CNAME + écriture en DB
	await provisionDomain(domain);
	await db.customDomain.update({
		where: { domain },
		data: { status: "ACTIVE" },
	});

	return { success: true, domainId: customDomain.id };
}

export async function deleteCustomDomainAction(
	domainId: string,
	organizationId: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "SETTINGS_EDIT");

	const customDomain = await db.customDomain.findUnique({
		where: { id: domainId, organizationId },
		select: { domain: true },
	});
	if (!customDomain) return { error: "Domaine introuvable." };

	await deprovisionDomain(customDomain.domain);

	await db.customDomain.delete({
		where: { id: domainId, organizationId },
	});

	revalidatePath("/dashboard");
	return { success: true };
}

// ─────────────────────────────────────────
// VÉRIFICATION DNS
// ─────────────────────────────────────────

export async function verifyDomainDnsAction(
	domainId: string,
	organizationId: string,
) {
	const session = await auth();
	if (!session?.user) return { error: "Non authentifié." };

	await requirePermission(session.user.id, organizationId, "SETTINGS_EDIT");

	const customDomain = await db.customDomain.findUnique({
		where: { id: domainId, organizationId },
	});
	if (!customDomain) return { error: "Domaine introuvable." };

	const TARGET_CNAME = process.env.CNAME_TARGET ?? "app.evoly.me";

	let isVerified = false;
	let dnsError: string | null = null;

	try {
		const addresses = await dns.resolveCname(customDomain.domain);
		isVerified = addresses.some(
			(addr: string) =>
				addr === TARGET_CNAME || addr.endsWith(`.${TARGET_CNAME}`),
		);
		if (!isVerified) {
			dnsError = `CNAME pointe vers ${addresses[0] ?? "inconnu"} au lieu de ${TARGET_CNAME}`;
		}
	} catch (err: any) {
		dnsError =
			err.code === "ENOTFOUND"
				? "Domaine introuvable. Vérifiez vos DNS."
				: err.code === "ENODATA"
					? "Aucun enregistrement CNAME trouvé."
					: "Erreur DNS. Réessayez dans quelques minutes.";
	}

	await db.customDomain.update({
		where: { id: domainId },
		data: {
			status: isVerified ? "ACTIVE" : "ERROR",
			sslStatus: isVerified ? "ACTIVE" : "PENDING",
			verifiedAt: isVerified ? new Date() : null,
			lastCheckedAt: new Date(),
		},
	});

	if (isVerified) {
		revalidatePath("/dashboard");
		return { success: true, verified: true };
	}

	return { success: true, verified: false, error: dnsError };
}
