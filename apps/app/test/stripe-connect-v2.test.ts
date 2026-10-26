import { describe, expect, it, vi } from "vitest";

const RUN = Math.random().toString(36).slice(2, 8);
const calls: { create: unknown[]; linkV2: unknown[]; linkV1: unknown[] } = {
  create: [],
  linkV2: [],
  linkV1: [],
};
let failV2Link = false;
let failCreate: unknown = null;
const fake = {
  v2: {
    core: {
      accounts: {
        create: vi.fn(async (p: unknown) => {
          if (failCreate) throw failCreate;
          calls.create.push(p);
          return { id: `acct_v2_${RUN}_${calls.create.length}` };
        }),
      },
      accountLinks: {
        create: vi.fn(async (p: unknown) => {
          calls.linkV2.push(p);
          if (failV2Link) throw new Error("compte v1 : lien v2 indisponible");
          return { url: "https://connect.stripe.com/setup/v2/test" };
        }),
      },
    },
  },
  accountLinks: {
    create: vi.fn(
      async (p: unknown) => (
        calls.linkV1.push(p),
        { url: "https://connect.stripe.com/setup/v1/test" }
      ),
    ),
  },
};
vi.mock("@/lib/stripe", () => ({ stripe: () => fake }));

const { db } = await import("@/lib/db");
const { stripeOnboardingUrl } = await import("@/server/stripeConnect");
type Ctx = Parameters<typeof stripeOnboardingUrl>[0];

describe("inscription Stripe des organisateurs avec Accounts v2", () => {
  it("création v2 (tableau de bord complet, frais et pertes chez Stripe, cartes et Bancontact), puis réutilisation du compte ; repli v1 pour le lien", async () => {
    const id = Math.random().toString(36).slice(2, 10);
    const org = await db.organization.create({
      data: {
        name: `Théâtre ${id}`,
        slug: `theatre-${id}`,
        subdomain: `theatre-${id}`,
        country: "BE",
        currency: "EUR",
        timezone: "Europe/Brussels",
        locale: "fr",
        contactEmail: `contact.${id}@exemple.be`,
      },
    });
    const user = await db.user.create({
      data: {
        name: "Camille",
        email: `own.${id}@exemple.be`,
        emailVerified: true,
      },
    });
    const ctx = {
      organization: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        country: "BE",
        currency: "EUR",
        locale: "fr",
        contactEmail: org.contactEmail,
      },
      user: { id: user.id, email: user.email },
    } as unknown as Ctx;

    expect(await stripeOnboardingUrl(ctx)).toBe(
      "https://connect.stripe.com/setup/v2/test",
    );
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0]).toEqual({
      contact_email: `contact.${id}@exemple.be`,
      display_name: `Théâtre ${id}`,
      dashboard: "full",
      identity: { country: "be" },
      defaults: {
        currency: "eur",
        locales: ["fr"],
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
            bancontact_payments: { requested: true },
          },
        },
      },
      metadata: { organizationId: org.id },
    });
    expect(calls.linkV2[0]).toMatchObject({
      account: `acct_v2_${RUN}_1`,
      use_case: {
        type: "account_onboarding",
        account_onboarding: { configurations: ["merchant"] },
      },
    });
    expect(
      await db.stripeAccount.findUniqueOrThrow({
        where: { organizationId: org.id },
      }),
    ).toMatchObject({
      stripeAccountId: `acct_v2_${RUN}_1`,
      status: "PENDING",
      country: "BE",
    });

    // deuxième clic : pas de nouveau compte ; lien v2 refusé (compte v1) → lien v1
    failV2Link = true;
    expect(await stripeOnboardingUrl(ctx)).toBe(
      "https://connect.stripe.com/setup/v1/test",
    );
    expect(calls.create).toHaveLength(1);
    expect(calls.linkV1[0]).toMatchObject({
      account: `acct_v2_${RUN}_1`,
      type: "account_onboarding",
    });
  });
});

describe("inscription Stripe : refus de Stripe expliqués", () => {
  const ctxOf = async () => {
    const id = Math.random().toString(36).slice(2, 10);
    const org = await db.organization.create({
      data: {
        name: `Cabaret ${id}`,
        slug: `cab-${id}`,
        subdomain: `cab-${id}`,
        country: "BE",
        currency: "EUR",
        timezone: "Europe/Brussels",
        locale: "fr",
      },
    });
    const user = await db.user.create({
      data: {
        name: "Camille",
        email: `own.${id}@exemple.be`,
        emailVerified: true,
      },
    });
    return {
      org,
      ctx: {
        organization: {
          id: org.id,
          slug: org.slug,
          name: org.name,
          country: "BE",
          currency: "EUR",
          locale: "fr",
          contactEmail: null,
        },
        user: { id: user.id, email: user.email },
      } as unknown as Ctx,
    };
  };

  it("plateforme pas encore activée par Stripe : message dédié, rien d'enregistré ; autre refus : message général", async () => {
    const { org, ctx } = await ctxOf();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    failCreate = {
      type: "StripeInvalidRequestError",
      code: "account_create_activation_required",
      requestId: "req_test",
      message: "Activate your account",
    };
    await expect(stripeOnboardingUrl(ctx)).rejects.toMatchObject({
      code: "STRIPE_PLATFORM_NOT_ACTIVATED",
    });
    expect(
      await db.stripeAccount.count({ where: { organizationId: org.id } }),
    ).toBe(0);
    expect(error.mock.calls[0]![1]).toMatchObject({
      code: "account_create_activation_required",
      requestId: "req_test",
    });
    failCreate = {
      type: "StripeAPIError",
      code: undefined,
      message: "An unknown error occurred",
    };
    await expect(stripeOnboardingUrl(ctx)).rejects.toMatchObject({
      code: "STRIPE_UNAVAILABLE",
    });
    failCreate = null;
    error.mockRestore();
  });

  it("erreur qui ne vient pas de Stripe : jamais masquée", async () => {
    const { ctx } = await ctxOf();
    failCreate = new TypeError("panne inattendue");
    await expect(stripeOnboardingUrl(ctx)).rejects.toThrow("panne inattendue");
    failCreate = null;
  });
});
