import { describe, expect, it, vi } from "vitest";
import { trialEligible } from "@evoly/core";
import { db } from "@/lib/db";
import { applyTimedDowngrades } from "@/server/billing";
import { reserveOrder } from "@/server/checkout";
import { findOrgContext, type OrgContext } from "@/server/context";
import { startProTrial } from "@/server/proBilling";

// clé Mollie d'Evoly (offre Pro, docs/MOLLIE.md, lot 6), posée avant les imports ; l'essai sans carte n'appelle pas Mollie
vi.hoisted(() => {
  process.env.MOLLIE_API_KEY = "test_essai_evoly";
});

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function setup() {
  const id = rid();
  const [owner, admin] = await Promise.all([
    db.user.create({
      data: {
        name: "Camille Dupont",
        email: `own.${id}@exemple.be`,
        emailVerified: true,
      },
    }),
    db.user.create({
      data: {
        name: "Sam Admin",
        email: `adm.${id}@exemple.be`,
        emailVerified: true,
      },
    }),
  ]);
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  const [ownerRole, adminRole] = await Promise.all([
    db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } }),
    db.role.findFirstOrThrow({ where: { systemKey: "ADMIN" } }),
  ]);
  await db.organizationMember.createMany({
    data: [
      {
        organizationId: org.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: "ACTIVE",
      },
      {
        organizationId: org.id,
        userId: admin.id,
        roleId: adminRole.id,
        status: "ACTIVE",
      },
    ],
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Entrée",
          priceMinor: 5000,
          currency: "EUR",
          quantity: 100,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const fee = async () =>
    (
      await db.order.findUniqueOrThrow({
        where: {
          id: (
            await reserveOrder({
              eventId: event.id,
              lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
              locale: "fr",
            })
          ).orderId,
        },
      })
    ).applicationFeeMinor;
  /** Abonnement payé par Mollie (mandat de prélèvement), dans l'état voulu : celui qu'y laisse la tâche horaire. */
  const mollieBilled = (data: Record<string, unknown>) =>
    db.subscription.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        interval: "MONTH",
        billingProvider: "MOLLIE",
        mollieCustomerId: `cst_${id}`,
        mollieMandateId: `mdt_${id}`,
        ...data,
      },
      update: data,
    });
  return { org, owner, admin, fee, mollieBilled };
}

describe("abonnement Pro géré par Evoly : essai, impayé, retour en Free (RG-SUB-02, RG-SUB-06 à 08)", () => {
  it("essai sans carte : plafond Pro pour les nouvelles commandes, un seul essai, e-mail au propriétaire", async () => {
    const s = await setup();
    expect(await s.fee()).toBe(129); // Free : 0,29 € + 2 % de 50 € = 1,29 €
    expect(
      trialEligible(
        await db.subscription.findUnique({
          where: { organizationId: s.org.id },
        }),
      ),
    ).toBe(true);
    const ctx: OrgContext = {
      ...(await findOrgContext(s.owner.id, s.org.slug))!,
      user: { id: s.owner.id, name: s.owner.name, email: s.owner.email },
    };
    await startProTrial(ctx, "YEAR");
    const sub = await db.subscription.findUniqueOrThrow({
      where: { organizationId: s.org.id },
    });
    expect(sub).toMatchObject({
      planId: "pro",
      status: "TRIALING",
      interval: "YEAR",
      billingProvider: null, // rien à payer pendant l'essai
    });
    expect(await s.fee()).toBe(100); // RG-SUB-07 : plafond Pro à 1 €
    expect(trialEligible(sub)).toBe(false);
    await expect(startProTrial(ctx, "YEAR")).rejects.toMatchObject({
      code: "ALREADY_SUBSCRIBED",
    });
    expect(
      await db.emailMessage.count({
        where: {
          organizationId: s.org.id,
          template: "subscription.started",
          toEmail: s.owner.email,
        },
      }),
    ).toBe(1);
  });

  it("retour en Free : membres suspendus sans rien supprimer, rétablis au retour en Pro (RG-SUB-08)", async () => {
    const s = await setup();
    const now = new Date();
    await s.mollieBilled({
      currentPeriodStart: new Date(now.getTime() - 20 * DAY),
      currentPeriodEnd: new Date(now.getTime() + 10 * DAY),
    });
    expect(await findOrgContext(s.admin.id, s.org.slug)).not.toBeNull();
    // résilié, échéance passée : la tâche horaire a terminé l'abonnement
    await s.mollieBilled({
      status: "CANCELED",
      cancelAtPeriodEnd: true,
      canceledAt: new Date(now.getTime() - 5 * DAY),
      currentPeriodEnd: new Date(now.getTime() - 3_600_000),
    });
    expect(await findOrgContext(s.admin.id, s.org.slug)).toBeNull();
    expect(await findOrgContext(s.owner.id, s.org.slug)).not.toBeNull();
    expect(
      await db.organizationMember.count({
        where: { organizationId: s.org.id },
      }),
    ).toBe(2);
    await applyTimedDowngrades(now);
    await applyTimedDowngrades(new Date(now.getTime() + 60_000)); // tâche lancée chaque minute
    expect(
      await db.emailMessage.count({
        where: { organizationId: s.org.id, template: "subscription.ended" },
      }),
    ).toBe(1);
    // abonné de nouveau : nouvelle période payée
    await s.mollieBilled({
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
    });
    expect(await findOrgContext(s.admin.id, s.org.slug)).not.toBeNull();
  });

  it("impayé : plafond Pro pendant 7 jours, puis commission Free (RG-SUB-06)", async () => {
    const s = await setup();
    const now = Date.now();
    await s.mollieBilled({
      status: "PAST_DUE",
      pastDueSince: new Date(now - 2 * DAY),
      currentPeriodStart: new Date(now - 2 * DAY),
      currentPeriodEnd: new Date(now + 28 * DAY),
    });
    expect(await s.fee()).toBe(100);
    await s.mollieBilled({ pastDueSince: new Date(now - 8 * DAY) });
    expect(await s.fee()).toBe(129); // au-delà de 7 jours : commission Free
  });
});

describe("offre Partenaire", () => {
  it("Pro offert : fonctionnalités Pro, et aucune commission Evoly sur les billets vendus", async () => {
    const s = await setup();
    expect(await s.fee()).toBeGreaterThan(0); // Free : commission
    await db.subscription.upsert({
      where: { organizationId: s.org.id },
      create: { organizationId: s.org.id, planId: "partner", status: "ACTIVE" },
      update: { planId: "partner", status: "ACTIVE", currentPeriodEnd: null },
    });
    expect(await s.fee()).toBe(0);
    const ctx = (await findOrgContext(s.owner.id, s.org.slug))!;
    expect(ctx.plan).toBe("partner");
    expect(ctx.features).toEqual(
      expect.arrayContaining([
        "EMAIL_MARKETING",
        "DYNAMIC_PRICING",
        "CUSTOM_DOMAINS",
        "REMOVE_EVOLY_BRANDING",
      ]),
    );
    expect(ctx.readOnly).toBe(false);
  });
});
