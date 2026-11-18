import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";

const rid = () => Math.random().toString(36).slice(2, 10);
const day = 86_400_000;

/** Une organisation dont le propriétaire a l'abonnement donné (payé par Mollie s'il a un mandat). */
async function orgWith(sub: {
  status: "ACTIVE" | "TRIALING";
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  mollieMandateId?: string;
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
          ...(sub.mollieMandateId
            ? {
                billingProvider: "MOLLIE" as const,
                mollieCustomerId: `cst_${id}`,
                mollieMandateId: sub.mollieMandateId,
              }
            : {}),
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
    });
    expect(ctx.plan).toBe("free");
  });

  it("essai offert par Evoly, terminé : retour en Free", async () => {
    const ctx = await orgWith({
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() - day),
    });
    expect(ctx.plan).toBe("free");
  });

  it("offre par Evoly encore en cours : Pro", async () => {
    const ctx = await orgWith({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * day),
    });
    expect(ctx.plan).toBe("pro");
  });

  it("abonnement payé par Mollie : Pro jusqu'à l'échéance, que le renouvellement (prélevé la veille) recule ; les dates font foi comme pour une offre d'Evoly", async () => {
    const renewing = await orgWith({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 12 * 3_600_000),
      mollieMandateId: `mdt_${rid()}`,
    });
    expect(renewing.plan).toBe("pro");
    const lapsed = await orgWith({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() - 3_600_000),
      mollieMandateId: `mdt_${rid()}`,
    });
    expect(lapsed.plan).toBe("free");
  });
});
