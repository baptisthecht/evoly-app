import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notifyGrantedProEnding } from "@/server/billing";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 10);
const day = 86_400_000;
async function orgWith(sub: { planId: string; status: string; currentPeriodEnd: Date; stripeSubscriptionId?: string | null }) {
  const u = await db.user.create({ data: { name: "Nora", email: `fin.${rid()}@exemple.be`, emailVerified: true } });
  const org = await createOrganization(u.id, { name: "Club", subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never);
  await db.subscription.update({ where: { organizationId: org.id }, data: sub as never });
  return org.id;
}
const notified = (organizationId: string) => db.auditLog.count({ where: { organizationId, action: "subscription.granted_ending_notified" } });

describe("fin d'un Pro offert : propriétaire prévenu 3 jours avant (RG-SUB-03)", () => {
  it("prévenu une seule fois, même si la tâche repasse chaque heure ; notification dans l'application", async () => {
    const now = new Date();
    const id = await orgWith({ planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 2 * day), stripeSubscriptionId: null });
    await notifyGrantedProEnding(now);
    await notifyGrantedProEnding(new Date(now.getTime() + 3_600_000));
    expect(await notified(id)).toBe(1);
    expect(await db.notification.count({ where: { organizationId: id, type: "TRIAL_ENDING" } })).toBe(1);
  });

  it("abonnement payé par Stripe, Pro qui ne finit pas bientôt, ou Free : rien", async () => {
    const now = new Date();
    const stripe = await orgWith({
      planId: "pro",
      status: "ACTIVE",
      currentPeriodEnd: new Date(now.getTime() + 2 * day),
      stripeSubscriptionId: `sub_${rid()}`,
    });
    const later = await orgWith({ planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 20 * day), stripeSubscriptionId: null });
    const ended = await orgWith({ planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() - day), stripeSubscriptionId: null });
    await notifyGrantedProEnding(now);
    expect([await notified(stripe), await notified(later), await notified(ended)]).toEqual([0, 0, 0]);
  });
});
