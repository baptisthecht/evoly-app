import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  available: true,
  created: [] as Array<{ domain: string; account: string }>,
  accounts: new Map<string, unknown>(),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () =>
    fake.available
      ? {
          accounts: { retrieve: async (id: string) => fake.accounts.get(id) },
          paymentMethodDomains: {
            create: async (
              p: { domain_name: string },
              o: { stripeAccount: string },
            ) => (
              fake.created.push({
                domain: p.domain_name,
                account: o.stripeAccount,
              }),
              {}
            ),
          },
        }
      : null,
}));
const conf = vi.hoisted(() => ({ base: "evoly.me" }));
vi.mock("@/lib/env", async (original) => {
  const real = (await original()) as { env: () => Record<string, unknown> };
  return { env: () => ({ ...real.env(), NEXT_PUBLIC_BASE_DOMAIN: conf.base }) };
});
const { db } = await import("@/lib/db");
const {
  accountStatus,
  ensurePaymentDomains,
  refreshStripeAccount,
  syncStripeAccount,
} = await import("@/server/stripeConnect");

const rid = () => Math.random().toString(36).slice(2, 10);
type Req = Partial<Stripe.Account.Requirements>;
const account = (
  over: {
    id?: string;
    charges?: boolean;
    payouts?: boolean;
    details?: boolean;
    req?: Req | null;
    currency?: string | null;
  } = {},
) =>
  ({
    id: over.id ?? `acct_${rid()}`,
    charges_enabled: over.charges ?? false,
    payouts_enabled: over.payouts ?? false,
    details_submitted: over.details ?? false,
    requirements:
      over.req === undefined
        ? {
            currently_due: [],
            past_due: [],
            eventually_due: [],
            disabled_reason: null,
          }
        : over.req,
    default_currency: over.currency === undefined ? "eur" : over.currency,
  }) as unknown as Stripe.Account;

async function connected(opts: { charges?: boolean; domains?: string[] } = {}) {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
    },
  });
  const owner = await db.user.create({
    data: {
      name: "Camille",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const role = await db.role.findUniqueOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: { organizationId: org.id, userId: owner.id, roleId: role.id },
  });
  const acct = await db.stripeAccount.create({
    data: {
      organizationId: org.id,
      stripeAccountId: `acct_${id}`,
      country: "BE",
      defaultCurrency: "EUR",
      status: "PENDING",
      chargesEnabled: opts.charges ?? false,
      payoutsEnabled: opts.charges ?? false,
      detailsSubmitted: false,
      requirementsDue: [],
      paymentDomains: opts.domains ?? [],
    },
  });
  return { id, org, acct };
}
const alerts = (organizationId: string) =>
  db.notification.count({
    where: { organizationId, type: "STRIPE_ACTION_REQUIRED" },
  });

beforeEach(() => {
  fake.available = true;
  fake.created = [];
  conf.base = "evoly.me";
});

describe("état d'un compte de paiement (section 9.16)", () => {
  it("refusé par Stripe : désactivé, même si les paiements semblaient actifs", () => {
    expect(
      accountStatus(
        account({
          charges: true,
          payouts: true,
          details: true,
          req: { disabled_reason: "rejected.fraud" } as Req,
        }),
      ),
    ).toBe("DISABLED");
  });
  it("paiements et virements actifs : actif, ou à compléter bientôt si Stripe annonce des documents", () => {
    expect(
      accountStatus(account({ charges: true, payouts: true, details: true })),
    ).toBe("ACTIVE");
    expect(
      accountStatus(
        account({
          charges: true,
          payouts: true,
          details: true,
          req: { eventually_due: ["individual.verification.document"] } as Req,
        }),
      ),
    ).toBe("RESTRICTED_SOON");
  });
  it("formulaire pas terminé : en attente", () => {
    expect(accountStatus(account({ details: false }))).toBe("PENDING");
  });
  it("formulaire terminé, mais paiements ou virements bloqués : restreint", () => {
    expect(
      accountStatus(account({ details: true, charges: true, payouts: false })),
    ).toBe("RESTRICTED");
    expect(
      accountStatus(account({ details: true, charges: false, payouts: true })),
    ).toBe("RESTRICTED");
  });
  it("réponse sans exigences : gérée", () => {
    expect(
      accountStatus(
        account({ charges: true, payouts: true, details: true, req: null }),
      ),
    ).toBe("ACTIVE");
  });
});

describe("synchronisation du compte (webhook account.updated, retour de Stripe)", () => {
  it("état, exigences et devise enregistrés ; l'organisateur prévenu une seule fois quand Stripe demande des informations", async () => {
    const s = await connected();
    const a = account({
      id: s.acct.stripeAccountId,
      details: true,
      req: {
        currently_due: ["individual.id_number"],
        past_due: ["external_account"],
        eventually_due: [],
        disabled_reason: null,
      } as Req,
      currency: "chf",
    });
    await syncStripeAccount(a);
    expect(
      await db.stripeAccount.findUniqueOrThrow({ where: { id: s.acct.id } }),
    ).toMatchObject({
      status: "RESTRICTED",
      detailsSubmitted: true,
      requirementsDue: ["individual.id_number", "external_account"],
      disabledReason: null,
      defaultCurrency: "CHF",
    });
    expect(await alerts(s.org.id)).toBeGreaterThanOrEqual(1);
    const after = await alerts(s.org.id);
    await syncStripeAccount(a); // même état : pas de nouvel avertissement
    expect(await alerts(s.org.id)).toBe(after);
  });

  it("compte redevenu actif : aucun avertissement", async () => {
    const s = await connected();
    await syncStripeAccount(
      account({
        id: s.acct.stripeAccountId,
        charges: true,
        payouts: true,
        details: true,
      }),
    );
    expect(
      (await db.stripeAccount.findUniqueOrThrow({ where: { id: s.acct.id } }))
        .status,
    ).toBe("ACTIVE");
    expect(await alerts(s.org.id)).toBe(0);
  });

  it("devise absente : euro par défaut", async () => {
    const s = await connected();
    await syncStripeAccount(
      account({ id: s.acct.stripeAccountId, details: true, currency: null }),
    );
    expect(
      (await db.stripeAccount.findUniqueOrThrow({ where: { id: s.acct.id } }))
        .defaultCurrency,
    ).toBe("EUR");
  });
});

describe("domaines de paiement pour Apple Pay et Google Pay (RG-DOM-04)", () => {
  it("organisation, événements à sous-domaine et domaines personnalisés déclarés, chacun une seule fois", async () => {
    const s = await connected({ charges: true });
    await db.event.create({
      data: {
        organizationId: s.org.id,
        slug: `gala-${s.id}`,
        publicCode: s.id.toUpperCase().slice(0, 8),
        title: "Gala",
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 86_400_000),
        subdomain: `gala-${s.id}`,
      },
    });
    const custom = await db.customDomain.create({
      data: {
        organizationId: s.org.id,
        domain: `billets-${s.id}.be`,
        scope: "ORGANIZATION",
        status: "ACTIVE",
        dnsTarget: "domaines.evoly.me",
        verificationToken: `jeton-${s.id}`,
      },
    });
    await ensurePaymentDomains(s.org.id);
    expect(fake.created.map((c) => c.domain).sort()).toEqual(
      [
        `billets-${s.id}.be`,
        `club-${s.id}.evoly.me`,
        `gala-${s.id}.evoly.me`,
      ].sort(),
    );
    expect(
      fake.created.every((c) => c.account === s.acct.stripeAccountId),
    ).toBe(true);
    expect(
      (await db.customDomain.findUniqueOrThrow({ where: { id: custom.id } }))
        .applePayRegistered,
    ).toBe(true);
    fake.created = [];
    await ensurePaymentDomains(s.org.id);
    expect(fake.created).toEqual([]); // déjà déclarés
  });

  it("rien n'est déclaré sans paiements actifs, en local, ou sans Stripe", async () => {
    const off = await connected({ charges: false });
    await ensurePaymentDomains(off.org.id);
    const on = await connected({ charges: true });
    conf.base = "localhost:3001";
    await ensurePaymentDomains(on.org.id);
    conf.base = "evoly.me";
    fake.available = false;
    await ensurePaymentDomains(on.org.id);
    expect(fake.created).toEqual([]);
  });

  it("mise à jour depuis Stripe : rien sans compte, sinon le compte relu est synchronisé", async () => {
    await refreshStripeAccount("organisation-sans-compte");
    const s = await connected();
    fake.accounts.set(
      s.acct.stripeAccountId,
      account({
        id: s.acct.stripeAccountId,
        charges: true,
        payouts: true,
        details: true,
      }),
    );
    await refreshStripeAccount(s.org.id);
    expect(
      (await db.stripeAccount.findUniqueOrThrow({ where: { id: s.acct.id } }))
        .status,
    ).toBe("ACTIVE");
  });
});
