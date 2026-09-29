"use server";

import { auth } from "@/lib/auth";
import { db } from "@evoly/db";
import { revalidatePath } from "next/cache";

// Génère un code de parrainage unique pour une org
function generateReferralCode(orgSlug: string): string {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const base = orgSlug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 12);
  return `${base}-${suffix}`;
}

// ── Créer ou récupérer le lien de parrainage de l'org ───────────────────────

export async function getReferralLinkAction(organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié" };

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    include: { role: true },
  });
  if (!membership?.role.permissions.includes("BILLING_MANAGE")) {
    return { error: "Permission refusée" };
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!org) return { error: "Organisation introuvable" };

  // Get or create referral for this org (one per org)
  let referral = await db.referral.findFirst({
    where: { referrerOrgId: organizationId },
    orderBy: { createdAt: "asc" },
  });

  if (!referral) {
    referral = await db.referral.create({
      data: {
        referrerOrgId: organizationId,
        code: generateReferralCode(org.slug),
      },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";
  return {
    referral: {
      code: referral.code,
      status: referral.status,
      rewardGrantedAt: referral.rewardGrantedAt?.toISOString() ?? null,
      referralUrl: `${appUrl}/register?ref=${referral.code}`,
    },
  };
}

// ── Récupérer les stats de parrainage ────────────────────────────────────────

export async function getReferralStatsAction(organizationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Non authentifié" };

  const referrals = await db.referral.findMany({
    where: { referrerOrgId: organizationId },
    include: {
      referredOrg: { select: { name: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rewarded = referrals.filter((r) => r.status === "REWARDED").length;
  const registered = referrals.filter((r) => r.status === "REGISTERED").length;

  return { referrals, rewarded, registered };
}

// ── Appliquer un code de parrainage lors de l'inscription ────────────────────
// Appelé depuis l'onboarding après création de l'org

export async function applyReferralCodeAction(code: string, newOrgId: string) {
  if (!code) return;

  const referral = await db.referral.findUnique({
    where: { code },
  });

  if (!referral || referral.status !== "PENDING") return;
  if (referral.referrerOrgId === newOrgId) return; // pas d'auto-parrainage

  await db.referral.update({
    where: { code },
    data: {
      referredOrgId: newOrgId,
      status: "REGISTERED",
    },
  });
}

// ── Déclencher la récompense après 1ère vente payante du filleul ─────────────
// Appelé depuis le webhook payment_intent.succeeded

// Appelé lors d'un achat d'abonnement annuel Pro
// Offre 1 mois Pro au parrain ET au filleul
export async function triggerReferralRewardAction(referredOrgId: string) {
  const referral = await db.referral.findFirst({
    where: { referredOrgId, status: "REGISTERED" },
    include: {
      referrerOrg: { select: { id: true, slug: true, planId: true, trialEndsAt: true } },
    },
  });

  if (!referral) return;

  const oneMonthFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Mark referral as rewarded
  await db.referral.update({
    where: { id: referral.id },
    data: { status: "REWARDED", rewardGrantedAt: new Date() },
  });

  // 1. Offrir 1 mois Pro au PARRAIN
  const referrerOrg = referral.referrerOrg;
  const referrerTrialEnds = referrerOrg.trialEndsAt;
  // Si déjà en trial, prolonger; sinon démarrer un trial
  const referrerNewTrial = referrerTrialEnds && referrerTrialEnds > new Date()
    ? new Date(referrerTrialEnds.getTime() + 30 * 24 * 60 * 60 * 1000)
    : oneMonthFromNow;

  await db.organization.update({
    where: { id: referrerOrg.id },
    data: {
      planId: "pro",
      subscriptionStatus: "TRIALING",
      trialEndsAt: referrerNewTrial,
    },
  });

  await db.notification.create({
    data: {
      organizationId: referrerOrg.id,
      type: "PAYMENT_FAILED",
      title: "🎁 1 mois Pro offert !",
      message: "Votre filleul vient de souscrire à un abonnement annuel. 1 mois Pro vous a été offert en remerciement.",
      link: `/dashboard/${referrerOrg.slug}/billing`,
    },
  });

  // 2. Offrir 1 mois Pro au FILLEUL (en plus de son abonnement)
  const referredOrg = await db.organization.findUnique({
    where: { id: referredOrgId },
    select: { id: true, slug: true, subscriptionEndsAt: true },
  });
  if (referredOrg?.subscriptionEndsAt) {
    // Prolonger l'abonnement d'un mois
    await db.organization.update({
      where: { id: referredOrgId },
      data: {
        subscriptionEndsAt: new Date(referredOrg.subscriptionEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await db.notification.create({
      data: {
        organizationId: referredOrgId,
        type: "PAYMENT_FAILED",
        title: "🎁 1 mois offert !",
        message: "Votre abonnement annuel a été prolongé d'1 mois grâce à votre code de parrainage.",
        link: `/dashboard/${referredOrg.slug}/billing`,
      },
    });
  }
}
