import "server-only";
import { humanCode } from "@evoly/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { audit } from "./audit";
import { sendEmail } from "./email/send";

export const REFERRAL_COOKIE = "evoly_ref";
const REWARD_DAYS = 30;
const REWARD_CREDIT_MINOR = 2900; // un mois de Pro

const ownerOf = async (organizationId: string) => (await db.organizationMember.findFirst({ where: { organizationId, role: { systemKey: "OWNER" } }, select: { userId: true } }))?.userId ?? null;

/** Section 9.22 : lien de parrainage de l'organisation (créé à la première demande). */
export async function referralLink(organizationId: string) {
  let link = await db.referral.findFirst({ where: { referrerOrgId: organizationId, referredOrgId: null, status: "PENDING" } });
  if (!link) link = await db.referral.create({ data: { code: humanCode(8).toLowerCase(), referrerOrgId: organizationId } });
  const sent = await db.referral.findMany({ where: { referrerOrgId: organizationId, referredOrgId: { not: null } }, select: { status: true } });
  return { code: link.code, url: `${env().NEXT_PUBLIC_APP_URL}/register?ref=${link.code}`, signedUp: sent.length, qualified: sent.filter((r) => r.status === "QUALIFIED" || r.status === "REWARDED").length, rewarded: sent.filter((r) => r.status === "REWARDED").length };
}

/** À la création d'une organisation : rattachement au parrain (jamais le même propriétaire, une seule fois). */
export async function attachReferral(newOrganizationId: string, ownerUserId: string, code: string | null | undefined) {
  const clean = (code ?? "").trim().toLowerCase().slice(0, 20);
  if (!clean) return;
  const link = await db.referral.findFirst({ where: { code: clean, referredOrgId: null } });
  if (!link || link.referrerOrgId === newOrganizationId) return;
  if ((await ownerOf(link.referrerOrgId)) === ownerUserId) return; // RG-PAR-01 : pas pour une organisation du même propriétaire
  if (await db.referral.findUnique({ where: { referredOrgId: newOrganizationId } })) return;
  await db.referral.create({ data: { code: `${clean}-${humanCode(6).toLowerCase()}`, referrerOrgId: link.referrerOrgId, referredOrgId: newOrganizationId, status: "SIGNED_UP" } });
  await audit({ action: "referral.signed_up", organizationId: link.referrerOrgId, actorType: "SYSTEM", targetType: "Organization", targetId: newOrganizationId });
}

/**
 * Première vente payante de l'organisation parrainée : un mois de Pro au parrain (RG-PAR-01 : serveur uniquement,
 * une seule fois). Abonnement Stripe actif : crédit de 29 € sur la prochaine facture ; sinon 30 jours de Pro ajoutés.
 */
export async function qualifyReferral(referredOrganizationId: string, now = new Date()) {
  const claimed = await db.referral.updateMany({ where: { referredOrgId: referredOrganizationId, status: "SIGNED_UP" }, data: { status: "QUALIFIED", qualifiedAt: now } });
  if (claimed.count === 0) return false; // déjà qualifiée ou sans parrain : aucune récompense en double
  const r = await db.referral.findUniqueOrThrow({ where: { referredOrgId: referredOrganizationId }, include: { referrerOrg: { select: { id: true, name: true, status: true, subscription: true } }, referredOrg: { select: { name: true } } } });
  if (r.referrerOrg.status !== "ACTIVE") return false;
  const sub = r.referrerOrg.subscription;
  let how = "PRO_DAYS";
  if (sub?.stripeSubscriptionId && sub.stripeCustomerId && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) {
    const s = stripe();
    if (s) {
      await s.customers.createBalanceTransaction(sub.stripeCustomerId, { amount: -REWARD_CREDIT_MINOR, currency: "eur", description: `Parrainage Evoly : ${r.referredOrg?.name ?? "organisation parrainée"}` });
      how = "STRIPE_CREDIT";
    }
  }
  if (how === "PRO_DAYS") {
    const from = sub && sub.planId === "pro" && sub.currentPeriodEnd && sub.currentPeriodEnd > now && ["ACTIVE", "TRIALING", "CANCELED"].includes(sub.status) ? sub.currentPeriodEnd : now;
    const until = new Date(from.getTime() + REWARD_DAYS * 86_400_000);
    // Pro sans limite déjà actif (offre attribuée) : rien à ajouter
    if (!(sub?.planId === "pro" && sub.status === "ACTIVE" && !sub.currentPeriodEnd && !sub.stripeSubscriptionId))
      await db.subscription.upsert({ where: { organizationId: r.referrerOrgId }, create: { organizationId: r.referrerOrgId, planId: "pro", status: "CANCELED", currentPeriodEnd: until, cancelAtPeriodEnd: true }, update: sub?.stripeSubscriptionId ? {} : { planId: "pro", status: "CANCELED", currentPeriodEnd: until, cancelAtPeriodEnd: true } });
  }
  await db.referral.update({ where: { id: r.id }, data: { status: "REWARDED", rewardGrantedAt: now } });
  await audit({ action: "referral.rewarded", organizationId: r.referrerOrgId, actorType: "SYSTEM", targetType: "Referral", targetId: r.id, metadata: { how } });
  const owner = await db.organizationMember.findFirst({ where: { organizationId: r.referrerOrgId, role: { systemKey: "OWNER" } }, include: { user: { select: { email: true } } } });
  if (owner)
    await sendEmail({ to: owner.user.email, template: "referral.rewarded", category: "SERVICE", organizationId: r.referrerOrgId, subject: "Un mois de Pro offert grâce à votre parrainage", text: `Bonne nouvelle : ${r.referredOrg?.name ?? "l'organisation que vous avez parrainée"} a réalisé sa première vente. ${how === "STRIPE_CREDIT" ? "Un crédit d'un mois de Pro est appliqué à votre prochaine facture." : "Votre organisation profite d'un mois de Pro supplémentaire."}\n\nMerci !\nEvoly`, html: `<p>Bonne nouvelle : <strong>${(r.referredOrg?.name ?? "l'organisation que vous avez parrainée").replace(/</g, "&lt;")}</strong> a réalisé sa première vente.</p><p>${how === "STRIPE_CREDIT" ? "Un crédit d'un mois de Pro est appliqué à votre prochaine facture." : "Votre organisation profite d'un mois de Pro supplémentaire."}</p><p>Merci !<br>Evoly</p>` }).catch(() => undefined);
  return true;
}
