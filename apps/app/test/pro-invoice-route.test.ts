import { beforeEach, describe, expect, it, vi } from "vitest";

// téléchargement d'une facture de l'offre Pro (docs/MOLLIE.md, lot 6) : session simulée, vraie base
const session = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string },
}));
vi.mock("@/server/session", () => ({
  requireUser: async () => {
    if (!session.user) throw new Error("REDIRECT /connexion");
    return { user: session.user };
  },
  getSession: async () => (session.user ? { user: session.user } : null),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/server/platform", () => ({ supportViewAllowed: async () => false }));

const { db } = await import("@/lib/db");
const { GET } =
  await import("@/app/o/[orgSlug]/billing/invoices/[invoiceId]/route");

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

/** Organisation, un membre du rôle donné, et une facture Pro émise pour un paiement reçu. */
async function setup(role: "OWNER" | "SCANNER" = "OWNER") {
  const id = rid();
  const user = await db.user.create({
    data: { name: "Camille", email: `f.${id}@exemple.be`, emailVerified: true },
  });
  const roleRow = await db.role.findUniqueOrThrow({
    where: { systemKey: role },
  });
  const now = new Date();
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
          status: "ACTIVE",
          currency: "EUR",
          billingProvider: "MOLLIE",
          mollieCustomerId: `cst_${id}`,
          mollieMandateId: `mdt_${id}`,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
        },
      },
      members: { create: { userId: user.id, roleId: roleRow.id } },
    },
    include: { subscription: true },
  });
  const payment = await db.subscriptionPayment.create({
    data: {
      organizationId: org.id,
      subscriptionId: org.subscription!.id,
      kind: "FIRST",
      status: "PAID",
      interval: "MONTH",
      amountMinor: 2900,
      currency: "EUR",
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * DAY),
      paidAt: now,
      method: "creditcard",
    },
  });
  const invoice = await db.proInvoice.create({
    data: {
      organizationId: org.id,
      paymentId: payment.id,
      number: `TEST-${id}`,
      issuedAt: now,
      interval: "MONTH",
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * DAY),
      currency: "EUR",
      totalMinor: 2900,
      vatRateBps: 2100,
      vatMinor: 503,
      vatMention: "BE_VAT",
      method: "creditcard",
      customer: { name: "Club", address: null, country: "BE", vatNumber: null },
    },
  });
  return {
    org,
    invoice,
    user: { id: user.id, name: user.name, email: user.email },
  };
}
const get = (slug: string, invoiceId: string) =>
  GET(new Request("https://app.evoly.test/"), {
    params: Promise.resolve({ orgSlug: slug, invoiceId }),
  });

beforeEach(() => {
  session.user = null;
});

describe("facture de l'offre Pro à télécharger", () => {
  it("propriétaire : le PDF de sa facture, sous son numéro, jamais mis en cache", async () => {
    const s = await setup();
    session.user = s.user;
    const res = await get(s.org.slug, s.invoice.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(
      `${s.invoice.number}.pdf`,
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(
      Buffer.from(await res.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  });

  it("facture d'une autre organisation : introuvable ; membre sans droit sur la facturation : refusé", async () => {
    const mine = await setup();
    const other = await setup();
    session.user = mine.user;
    expect((await get(mine.org.slug, other.invoice.id)).status).toBe(404);
    const scanner = await setup("SCANNER");
    session.user = scanner.user;
    expect((await get(scanner.org.slug, scanner.invoice.id)).status).toBe(403);
  });
});
