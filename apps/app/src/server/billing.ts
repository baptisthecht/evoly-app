import "server-only";
import { notify } from "./notifications";
import {
  daysBeforeDowngrade,
  effectivePlan,
  PAST_DUE_GRACE_DAYS,
  trialEligible,
} from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { proBillingProvider, proBillingView } from "./proBilling";
import { notifyOwner } from "./subscriptionMail";

/**
 * Page Abonnement (section 9.21) : offre, statut, prix, droit à l'essai, délai avant rétrogradation, paiements et
 * factures. L'offre Pro se paie par Mollie, sur le compte d'Evoly (docs/MOLLIE.md, lot 6).
 */
export async function billingState(ctx: OrgContext, now = new Date()) {
  const [sub, terms, trialDays] = await Promise.all([
    db.subscription.findUnique({
      where: { organizationId: ctx.organization.id },
    }),
    db.planCurrencyTerms.findMany({
      where: { currency: ctx.organization.currency },
    }),
    db.plan.findUnique({ where: { id: "pro" }, select: { trialDays: true } }),
  ]);
  const pro = terms.find((t) => t.planId === "pro");
  const free = terms.find((t) => t.planId === "free");
  return {
    plan: effectivePlan(sub, now),
    sub,
    trialEligible: trialEligible(sub) && (trialDays?.trialDays ?? 14) > 0,
    daysBeforeDowngrade: sub ? daysBeforeDowngrade(sub, now) : null,
    currency: ctx.organization.currency,
    prices: {
      MONTH: pro?.monthlyPriceMinor ?? 2900,
      YEAR: pro?.yearlyPriceMinor ?? 29580,
    },
    caps: { free: free?.feeCapMinor ?? 100, pro: pro?.feeCapMinor ?? 70 },
    /** l'offre Pro peut se payer : clé Mollie d'Evoly configurée */
    provider: proBillingProvider(),
    /** abonnement payé par Mollie (renouvelé, résilié ou impayé) */
    mollieBilled: sub?.billingProvider === "MOLLIE" && !!sub.mollieMandateId,
    ...(await proBillingView(ctx.organization.id, now)),
  };
}

/**
 * Rétrogradations dues au temps (impayé au-delà de 7 jours, fin de période résiliée) : le propriétaire est prévenu une
 * seule fois par retour en Free, dans le jour qui suit (tâche lancée chaque minute ; avant le 18 novembre 2026,
 * l'e-mail repartait à chaque passage pendant une heure).
 */
export async function applyTimedDowngrades(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 86_400_000);
  const candidates = await db.subscription.findMany({
    where: {
      planId: "pro",
      OR: [
        {
          status: { in: ["PAST_DUE", "UNPAID"] },
          pastDueSince: {
            lte: new Date(now.getTime() - PAST_DUE_GRACE_DAYS * 86_400_000),
            gt: new Date(since.getTime() - PAST_DUE_GRACE_DAYS * 86_400_000),
          },
        },
        { status: "CANCELED", currentPeriodEnd: { lte: now, gt: since } },
      ],
    },
  });
  let n = 0;
  for (const s of candidates) {
    if (effectivePlan(s, now) !== "free") continue;
    const endedAt =
      s.status === "CANCELED"
        ? s.currentPeriodEnd!
        : new Date(
            s.pastDueSince!.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000,
          );
    const marker = `${s.id}:${endedAt.toISOString()}`;
    if (
      await db.auditLog.findFirst({
        where: { action: "subscription.ended_notified", targetId: marker },
        select: { id: true },
      })
    )
      continue;
    await audit({
      action: "subscription.ended_notified",
      organizationId: s.organizationId,
      actorType: "SYSTEM",
      targetType: "Subscription",
      targetId: marker,
    });
    await notifyOwner(s.organizationId, "ENDED");
    n += 1;
  }
  return n;
}

/**
 * RG-SUB-03 : Pro attribué par Evoly (offre de lancement, parrainage, geste commercial) ou essai sans carte : le
 * propriétaire est prévenu 3 jours avant la fin, une seule fois par période, avec l'invitation à s'abonner. Un
 * abonnement payé par Mollie n'est pas concerné. Tâche lancée chaque heure.
 */
export async function notifyGrantedProEnding(now = new Date()) {
  const soon = await db.subscription.findMany({
    where: {
      planId: "pro",
      status: { in: ["ACTIVE", "TRIALING"] },
      billingProvider: null,
      currentPeriodEnd: {
        gt: now,
        lte: new Date(now.getTime() + 3 * 86_400_000),
      },
    },
    select: {
      id: true,
      organizationId: true,
      currentPeriodEnd: true,
      status: true,
    },
    orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
  });
  let sent = 0;
  for (const s of soon) {
    const marker = `${s.id}:${s.currentPeriodEnd!.toISOString()}`;
    if (
      await db.auditLog.findFirst({
        where: {
          action: "subscription.granted_ending_notified",
          targetId: marker,
        },
        select: { id: true },
      })
    )
      continue;
    await notifyOwner(s.organizationId, "PRO_ENDING");
    await notify(
      s.organizationId,
      "TRIAL_ENDING",
      s.status === "TRIALING"
        ? {
            title: "Fin de votre essai Pro",
            body: "Votre essai Pro se termine dans 3 jours : abonnez-vous pour garder Pro, sinon vous repasserez en Free, sans rien perdre.",
            link: "/billing",
          }
        : {
            title: "Fin de votre Pro offert",
            body: "Votre Pro offert se termine dans 3 jours : abonnez-vous pour le garder, sinon vous repasserez en Free, sans rien perdre.",
            link: "/billing",
          },
      { email: false },
    );
    await audit({
      action: "subscription.granted_ending_notified",
      organizationId: s.organizationId,
      targetType: "Subscription",
      targetId: marker,
    });
    sent += 1;
  }
  return sent;
}
