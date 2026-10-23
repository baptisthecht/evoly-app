import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { invoiceSubscriptionId, trialEnding } from "@/server/billing";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("abonnement d'une facture, dans les deux formats de l'API Stripe", () => {
  it("nouveau format : identifiant ou objet", () => {
    expect(
      invoiceSubscriptionId({
        parent: { subscription_details: { subscription: "sub_1" } },
      }),
    ).toBe("sub_1");
    expect(
      invoiceSubscriptionId({
        parent: { subscription_details: { subscription: { id: "sub_2" } } },
      }),
    ).toBe("sub_2");
  });
  it("ancien format : identifiant ou objet", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_3" })).toBe("sub_3");
    expect(invoiceSubscriptionId({ subscription: { id: "sub_4" } })).toBe(
      "sub_4",
    );
    expect(
      invoiceSubscriptionId({
        parent: { subscription_details: { subscription: null } },
        subscription: "sub_5",
      }),
    ).toBe("sub_5");
  });
  it("facture sans abonnement : rien", () => {
    expect(invoiceSubscriptionId({})).toBeNull();
    expect(
      invoiceSubscriptionId({ parent: null, subscription: null }),
    ).toBeNull();
  });
});

describe("fin d'essai Pro dans 3 jours (RG-SUB-03)", () => {
  it("propriétaire prévenu par e-mail et par notification ; abonnement inconnu : rien", async () => {
    const id = rid();
    const owner = await db.user.create({
      data: {
        name: "Camille Dupont",
        email: `own.${id}@exemple.be`,
        emailVerified: true,
      },
    });
    const role = await db.role.findUniqueOrThrow({
      where: { systemKey: "OWNER" },
    });
    const org = await db.organization.create({
      data: {
        name: "Club",
        slug: `club-${id}`,
        subdomain: `club-${id}`,
        country: "BE",
        currency: "EUR",
        subscription: {
          create: {
            planId: "pro",
            status: "TRIALING",
            currency: "EUR",
            stripeSubscriptionId: `sub_${id}`,
          },
        },
        members: { create: { userId: owner.id, roleId: role.id } },
      },
    });
    await trialEnding({ id: `sub_${id}` });
    expect(
      await db.emailMessage.count({
        where: { template: "subscription.trial_ending", toEmail: owner.email },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { organizationId: org.id, type: "TRIAL_ENDING" },
      }),
    ).toBeGreaterThanOrEqual(1);
    await expect(
      trialEnding({ id: `sub_inconnu_${id}` }),
    ).resolves.toBeUndefined();
  });
});
