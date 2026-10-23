import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";

const rid = () => Math.random().toString(36).slice(2, 10);
const day = 86_400_000;

/** Une organisation dont le propriétaire a l'abonnement donné. */
async function orgWith(sub: {
  status: "ACTIVE" | "TRIALING";
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  stripeSubscriptionId: string | null;
}) {
  const id = rid();
  const user = await db.user.create({
    data: {
      name: "Camille",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const owner = await db.role.findUniqueOrThrow({
    where: { systemKey: "OWNER" },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      subscription: {
        create: {
          planId: "pro",
          currency: "EUR",
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd ?? null,
          trialEndsAt: sub.trialEndsAt ?? null,
          stripeSubscriptionId: sub.stripeSubscriptionId,
        },
      },
      members: { create: { userId: user.id, roleId: owner.id } },
    },
  });
  return (await findOrgContext(user.id, org.slug))!;
}

describe("offre effective dans l'espace organisateur : une offre attribuée par Evoly expire à sa date (18 octobre 2026)", () => {
  it("offre datée par Evoly, arrivée à sa fin : retour en Free, fonctions Pro retirées", async () => {
    const ctx = await orgWith({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() - day),
      stripeSubscriptionId: null,
    });
    expect(ctx.plan).toBe("free");
  });

  it("essai offert par Evoly, terminé : retour en Free", async () => {
    const ctx = await orgWith({
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() - day),
      stripeSubscriptionId: null,
    });
    expect(ctx.plan).toBe("free");
  });

  it("offre par Evoly encore en cours : Pro", async () => {
    const ctx = await orgWith({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * day),
      stripeSubscriptionId: null,
    });
    expect(ctx.plan).toBe("pro");
  });

  it("abonnement Stripe dont le renouvellement n'est pas encore arrivé : reste Pro, c'est Stripe qui y met fin", async () => {
    const ctx = await orgWith({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() - 3_600_000),
      stripeSubscriptionId: `sub_${rid()}`,
    });
    expect(ctx.plan).toBe("pro");
  });
});
