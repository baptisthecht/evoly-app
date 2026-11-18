import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// compte Mollie d'Evoly (offre Pro, docs/MOLLIE.md, lot 6) : clé d'essai, aucune requête ne part (fetch simulé)
process.env.MOLLIE_API_KEY = "test_essai_evoly";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers(),
}));

const { db } = await import("@/lib/db");
const { createOrganization } = await import("@/server/onboarding");
const {
  cancelProSubscription,
  handleProWebhook,
  mandateLabel,
  proPaymentReturn,
  runProBilling,
  scheduleIntervalSwitch,
  startPaymentMethodChange,
  startProCheckout,
} = await import("@/server/proBilling");
const { issueProInvoice, proInvoicePdf } = await import("@/server/proInvoices");
const { billingState, notifyGrantedProEnding } =
  await import("@/server/billing");
const { assignPlan, extendTrial } = await import("@/server/platform");
const { qualifyReferral } = await import("@/server/referrals");
const { deletionBlockers } = await import("@/server/organization");
const { addBillingInterval, effectivePlan } = await import("@evoly/core");
type Staff = Parameters<typeof assignPlan>[0];

type Route = { method: string; path: string; status?: number; body?: unknown };
type Call = { method: string; url: URL; body: string };
const calls: Call[] = [];

/** Mollie répond selon la méthode et le chemin ; chaque réponse ne sert qu'une fois, dans l'ordre donné. */
function mollie(...routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      calls.push({
        method,
        url,
        body: typeof init.body === "string" ? init.body : "",
      });
      const i = routes.findIndex(
        (r) => r.method === method && r.path === url.pathname,
      );
      if (i < 0)
        return new Response(
          JSON.stringify({
            status: 404,
            title: "Not Found",
            detail: url.pathname,
          }),
          { status: 404 },
        );
      const [r] = routes.splice(i, 1);
      return new Response(
        r!.body === undefined ? null : JSON.stringify(r!.body),
        { status: r!.status ?? 200 },
      );
    }),
  );
}
beforeEach(() => {
  calls.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
const eur = (value: string) => ({ currency: "EUR", value });
const dir = mkdtempSync(join(tmpdir(), "factures-pro-"));
function pdfText(bytes: Uint8Array) {
  const file = join(dir, `${rid()}.pdf`);
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", [file, "-"], { encoding: "utf8" })
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ");
}

async function organizer() {
  const id = rid();
  const user = await db.user.create({
    data: { name: "Nora", email: `nora.${id}@exemple.be`, emailVerified: true },
  });
  const org = await createOrganization(user.id, {
    name: `Cercle ${id}`,
    subdomain: `cercle-${id}`,
    country: "BE",
    type: "ASSOCIATION",
  } as never);
  const ctx = {
    organization: {
      id: org.id,
      slug: org.slug,
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
    user: { id: user.id },
  } as never;
  return { id, org, user, ctx };
}
type Org = Awaited<ReturnType<typeof organizer>>;

/** Abonnement payé par Mollie, dans l'état voulu. */
async function billed(o: Org, data: Record<string, unknown> = {}) {
  const now = Date.now();
  return db.subscription.update({
    where: { organizationId: o.org.id },
    data: {
      planId: "pro",
      status: "ACTIVE",
      interval: "MONTH",
      billingProvider: "MOLLIE",
      mollieCustomerId: `cst_${o.id}`,
      mollieMandateId: `mdt_${o.id}`,
      paymentMethodLabel: "Visa •••• 4242",
      currentPeriodStart: new Date(now - 10 * DAY),
      currentPeriodEnd: new Date(now + 20 * DAY),
      ...data,
    },
  });
}

/** Paiement Pro enregistré tel quel (état de départ d'un cas). */
async function payment(o: Org, data: Record<string, unknown>) {
  const sub = await db.subscription.findUniqueOrThrow({
    where: { organizationId: o.org.id },
  });
  return db.subscriptionPayment.create({
    data: {
      organizationId: o.org.id,
      subscriptionId: sub.id,
      kind: "RENEWAL",
      status: "OPEN",
      interval: "MONTH",
      amountMinor: 2900,
      currency: "EUR",
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      ...data,
    } as never,
  });
}

/** La tâche horaire ne voit que l'abonnement du test (la base garde ceux des passages précédents). */
async function alone() {
  await db.subscription.updateMany({
    where: { billingProvider: "MOLLIE" },
    data: { billingProvider: null },
  });
  await db.subscriptionPayment.updateMany({
    where: { status: { in: ["OPEN", "PENDING"] } },
    data: { status: "FAILED" },
  });
}

const subOf = (o: Org) =>
  db.subscription.findUniqueOrThrow({ where: { organizationId: o.org.id } });
const mails = (o: Org, template: string) =>
  db.emailMessage.count({ where: { organizationId: o.org.id, template } });

describe("offre Pro payée par Mollie : cas particuliers (docs/MOLLIE.md, lot 6)", () => {
  it("moyen de paiement affiché : carte, IBAN, PayPal, ou rien de lisible", () => {
    expect(
      mandateLabel({
        id: "mdt_1",
        method: "creditcard",
        status: "valid",
        details: { cardLabel: "Mastercard", cardNumber: "5555 5555 5555 4444" },
      }),
    ).toBe("Mastercard •••• 4444");
    expect(
      mandateLabel({
        id: "mdt_1",
        method: "creditcard",
        status: "valid",
        details: { cardLabel: "Visa" },
      }),
    ).toBe("Visa");
    expect(
      mandateLabel({
        id: "mdt_1",
        method: "directdebit",
        status: "valid",
        details: { consumerAccount: "NL55 INGB 0000 0000 00" },
      }),
    ).toBe("NL55 •••• 0000");
    expect(
      mandateLabel({ id: "mdt_1", method: "paypal", status: "valid" }),
    ).toBe("PayPal");
    expect(
      mandateLabel({ id: "mdt_1", method: "belfius", status: "valid" }),
    ).toBeNull();
  });

  it("déjà abonné, Partenaire, résilié en cours ou Pro offert sans fin : rien à payer ; sans abonnement Mollie : rien à gérer", async () => {
    mollie();
    const active = await organizer();
    await billed(active);
    await expect(startProCheckout(active.ctx, "MONTH")).rejects.toMatchObject({
      code: "ALREADY_SUBSCRIBED",
    });
    const ending = await organizer();
    await billed(ending, { cancelAtPeriodEnd: true });
    await expect(startProCheckout(ending.ctx, "MONTH")).rejects.toMatchObject({
      code: "ALREADY_SUBSCRIBED",
    });
    const partner = await organizer();
    await db.subscription.update({
      where: { organizationId: partner.org.id },
      data: { planId: "partner", status: "ACTIVE", currentPeriodEnd: null },
    });
    await expect(startProCheckout(partner.ctx, "MONTH")).rejects.toMatchObject({
      code: "ALREADY_SUBSCRIBED",
    });
    const offered = await organizer();
    await db.subscription.update({
      where: { organizationId: offered.org.id },
      data: { planId: "pro", status: "ACTIVE", currentPeriodEnd: null },
    });
    await expect(startProCheckout(offered.ctx, "MONTH")).rejects.toMatchObject({
      code: "ALREADY_SUBSCRIBED",
    });
    const free = await organizer();
    for (const action of [
      () => startPaymentMethodChange(free.ctx),
      () => cancelProSubscription(free.ctx),
      () => scheduleIntervalSwitch(free.ctx, "YEAR"),
    ])
      await expect(action()).rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect(calls).toHaveLength(0);
  });

  it("période impayée : réglée sur la page de Mollie avec un nouveau moyen de paiement (prélèvement en cours : attendre), puis à jour", async () => {
    const o = await organizer();
    const sub = await billed(o, {
      status: "PAST_DUE",
      pastDueSince: new Date(Date.now() - 2 * DAY),
    });
    const pending = await payment(o, { status: "PENDING" });
    mollie();
    await expect(startProCheckout(o.ctx, "YEAR")).rejects.toMatchObject({
      code: "PAYMENT_PENDING",
    });
    await db.subscriptionPayment.update({
      where: { id: pending.id },
      data: { status: "FAILED", failedAt: new Date() },
    });
    vi.unstubAllGlobals();
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: `tr_regle${o.id}`,
        status: "open",
        amount: eur("29.00"),
        _links: { checkout: { href: "https://www.mollie.com/checkout/regle" } },
      },
    });
    expect(await startProCheckout(o.ctx, "YEAR")).toBe(
      "https://www.mollie.com/checkout/regle",
    );
    // la période impayée, au mensuel en cours (pas l'annuel demandé)
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      amount: eur("29.00"),
      sequenceType: "first",
    });
    const settle = await db.subscriptionPayment.findFirstOrThrow({
      where: { organizationId: o.org.id, kind: "SETTLE" },
    });
    expect(settle.periodStart).toEqual(sub.currentPeriodStart);
    vi.unstubAllGlobals();
    // Mollie ne donne pas l'identifiant du mandat : le plus récent du client est pris
    mollie(
      {
        method: "GET",
        path: `/v2/payments/tr_regle${o.id}`,
        body: {
          id: `tr_regle${o.id}`,
          status: "paid",
          amount: eur("29.00"),
          method: "bancontact",
          customerId: `cst_${o.id}`,
          _links: {},
        },
      },
      {
        method: "GET",
        path: `/v2/customers/cst_${o.id}/mandates`,
        body: {
          count: 2,
          _embedded: {
            mandates: [
              {
                id: `mdt_ancien${o.id}`,
                method: "creditcard",
                status: "invalid",
              },
              {
                id: `mdt_nouveau${o.id}`,
                method: "directdebit",
                status: "valid",
                details: { consumerAccount: "BE68539007547034" },
              },
            ],
          },
          _links: { next: null },
        },
      },
    );
    expect((await proPaymentReturn(o.ctx, settle.id))?.status).toBe("PAID");
    expect(await subOf(o)).toMatchObject({
      status: "ACTIVE",
      pastDueSince: null,
      mollieMandateId: `mdt_nouveau${o.id}`,
      paymentMethodLabel: "BE68 •••• 7034",
    });
    expect(await db.proInvoice.count({ where: { paymentId: settle.id } })).toBe(
      1,
    );
  });

  it("depuis Free : page de paiement encore ouverte reprise, payée entre-temps : passage en Pro et e-mail de bienvenue", async () => {
    const o = await organizer();
    const now = new Date();
    mollie(
      {
        method: "POST",
        path: "/v2/customers",
        status: 201,
        body: { id: `cst_${o.id}` },
      },
      {
        method: "POST",
        path: "/v2/payments",
        status: 201,
        body: {
          id: `tr_free${o.id}`,
          status: "open",
          amount: eur("29.00"),
          _links: { checkout: { href: "https://www.mollie.com/checkout/f" } },
        },
      },
    );
    await startProCheckout(o.ctx, "MONTH", now);
    vi.unstubAllGlobals();
    calls.length = 0;
    const open = {
      method: "GET",
      path: `/v2/payments/tr_free${o.id}`,
      body: {
        id: `tr_free${o.id}`,
        status: "open",
        amount: eur("29.00"),
        _links: { checkout: { href: "https://www.mollie.com/checkout/f" } },
      },
    };
    mollie(open);
    expect(await startProCheckout(o.ctx, "MONTH", now)).toBe(
      "https://www.mollie.com/checkout/f",
    );
    expect(calls.map((c) => c.method)).toEqual(["GET"]); // aucun nouveau paiement
    vi.unstubAllGlobals();
    mollie(
      {
        method: "GET",
        path: `/v2/payments/tr_free${o.id}`,
        body: {
          id: `tr_free${o.id}`,
          status: "paid",
          amount: eur("29.00"),
          method: "creditcard",
          mandateId: `mdt_${o.id}`,
          customerId: `cst_${o.id}`,
          _links: {},
        },
      },
      {
        method: "GET",
        path: `/v2/customers/cst_${o.id}/mandates/mdt_${o.id}`,
        status: 500,
        body: { title: "Internal" },
      },
    );
    const url = await startProCheckout(o.ctx, "MONTH", now);
    expect(url).toContain(`/o/${o.org.slug}/billing?mollie=`);
    const sub = await subOf(o);
    expect(sub).toMatchObject({
      status: "ACTIVE",
      billingProvider: "MOLLIE",
      mollieMandateId: `mdt_${o.id}`,
      paymentMethodLabel: null, // mandat illisible pour l'instant : enregistré sans libellé
    });
    expect(effectivePlan(sub, now)).toBe("pro");
    expect(await mails(o, "subscription.started")).toBe(1);
    expect(
      await db.auditLog.count({
        where: { organizationId: o.org.id, action: "billing.upgraded" },
      }),
    ).toBe(1);
  });

  it("Mollie injoignable : client ou paiement impossibles à créer, message clair et rien de payé", async () => {
    const o = await organizer();
    mollie({
      method: "POST",
      path: "/v2/customers",
      status: 503,
      body: { title: "Service Unavailable" },
    });
    await expect(startProCheckout(o.ctx, "MONTH")).rejects.toMatchObject({
      code: "MOLLIE_UNAVAILABLE",
    });
    vi.unstubAllGlobals();
    mollie(
      {
        method: "POST",
        path: "/v2/customers",
        status: 201,
        body: { id: `cst_${o.id}` },
      },
      {
        method: "POST",
        path: "/v2/payments",
        status: 500,
        body: { title: "Internal Server Error" },
      },
    );
    await expect(startProCheckout(o.ctx, "MONTH")).rejects.toMatchObject({
      code: "MOLLIE_UNAVAILABLE",
    });
    const row = await db.subscriptionPayment.findFirstOrThrow({
      where: { organizationId: o.org.id },
    });
    expect(row.status).toBe("FAILED");
    expect(row.failureReason).toContain("Mollie 500");
    // paiement refusé d'emblée, sans page de paiement : retour sur la page Abonnement
    vi.unstubAllGlobals();
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: `tr_refus${o.id}`,
        status: "failed",
        amount: eur("29.00"),
        _links: {},
      },
    });
    const back = await startProCheckout(o.ctx, "MONTH");
    expect(back).toContain("?mollie=");
    expect(
      (
        await db.subscriptionPayment.findUniqueOrThrow({
          where: { molliePaymentId: `tr_refus${o.id}` },
        })
      ).status,
    ).toBe("FAILED");
    expect(effectivePlan(await subOf(o), new Date())).toBe("free");
  });

  it("montant inattendu ignoré ; paiement échoué définitif ; premier paiement annulé : rien ne change ; retour inconnu ou Mollie en panne", async () => {
    const o = await organizer();
    await billed(o);
    const odd = await payment(o, {
      kind: "FIRST",
      molliePaymentId: `tr_bizarre${o.id}`,
    });
    mollie({
      method: "GET",
      path: `/v2/payments/tr_bizarre${o.id}`,
      body: {
        id: `tr_bizarre${o.id}`,
        status: "paid",
        amount: eur("1.00"),
        _links: {},
      },
    });
    expect((await proPaymentReturn(o.ctx, odd.id))?.status).toBe("OPEN");
    const failed = await payment(o, {
      kind: "FIRST",
      status: "FAILED",
      molliePaymentId: `tr_echec${o.id}`,
    });
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/tr_echec${o.id}`,
      body: {
        id: `tr_echec${o.id}`,
        status: "paid",
        amount: eur("29.00"),
        _links: {},
      },
    });
    expect((await proPaymentReturn(o.ctx, failed.id))?.status).toBe("FAILED");
    const canceled = await payment(o, {
      kind: "FIRST",
      molliePaymentId: `tr_annule${o.id}`,
    });
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/tr_annule${o.id}`,
      body: {
        id: `tr_annule${o.id}`,
        status: "canceled",
        amount: eur("29.00"),
        _links: {},
      },
    });
    expect((await proPaymentReturn(o.ctx, canceled.id))?.status).toBe("FAILED");
    expect(await subOf(o)).toMatchObject({ status: "ACTIVE" });
    expect(await proPaymentReturn(o.ctx, "inconnu")).toBeNull();
    const down = await payment(o, {
      kind: "FIRST",
      molliePaymentId: `tr_panne${o.id}`,
    });
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/tr_panne${o.id}`,
      status: 502,
      body: { title: "Bad Gateway" },
    });
    expect((await proPaymentReturn(o.ctx, down.id))?.status).toBe("OPEN");
  });

  it("webhook d'un paiement dont l'identifiant n'est pas encore noté : retrouvé par ses métadonnées ; identifiant mal formé ignoré", async () => {
    const o = await organizer();
    await billed(o);
    const row = await payment(o, { molliePaymentId: null });
    mollie({
      method: "GET",
      path: `/v2/payments/tr_tardif${o.id}`,
      body: {
        id: `tr_tardif${o.id}`,
        status: "pending",
        amount: eur("29.00"),
        method: "directdebit",
        metadata: { subscriptionPaymentId: row.id },
        _links: {},
      },
    });
    await handleProWebhook(`tr_tardif${o.id}`);
    expect(
      await db.subscriptionPayment.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      molliePaymentId: `tr_tardif${o.id}`,
      status: "PENDING",
      method: "directdebit",
    });
    vi.unstubAllGlobals();
    calls.length = 0;
    mollie();
    await handleProWebhook("pas-un-identifiant");
    expect(calls).toHaveLength(0);
  });

  it("paiement contesté auprès de la banque : la période redevient due, propriétaire prévenu", async () => {
    const o = await organizer();
    await billed(o);
    const paid = await payment(o, {
      status: "PAID",
      molliePaymentId: `tr_conteste${o.id}`,
      paidAt: new Date(),
    });
    mollie({
      method: "GET",
      path: `/v2/payments/tr_conteste${o.id}`,
      body: {
        id: `tr_conteste${o.id}`,
        status: "paid",
        amount: eur("29.00"),
        amountChargedBack: eur("29.00"),
        _links: {},
      },
    });
    await handleProWebhook(`tr_conteste${o.id}`);
    expect(
      (
        await db.subscriptionPayment.findUniqueOrThrow({
          where: { id: paid.id },
        })
      ).status,
    ).toBe("CHARGED_BACK");
    expect((await subOf(o)).status).toBe("PAST_DUE");
    expect(await mails(o, "subscription.payment_failed")).toBe(1);
  });

  it("tâche horaire : mandat refusé par Mollie, prélèvement sans réponse retrouvé ou refait, facture manquante émise, préavis annuel envoyé une fois, impayé en cours de prélèvement gardé", async () => {
    await alone();
    // mandat révoqué : le renouvellement échoue d'emblée
    const revoked = await organizer();
    await billed(revoked, {
      currentPeriodEnd: new Date(Date.now() + 3_600_000),
    });
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 422,
      body: {
        title: "Unprocessable Entity",
        detail: "The mandate is invalid",
        field: "mandateId",
      },
    });
    expect((await runProBilling()).renewed).toBe(1);
    expect((await subOf(revoked)).status).toBe("PAST_DUE");
    expect(
      (
        await db.subscriptionPayment.findFirstOrThrow({
          where: { organizationId: revoked.org.id, kind: "RENEWAL" },
        })
      ).failureReason,
    ).toContain("mandate is invalid");
    expect(await mails(revoked, "subscription.payment_failed")).toBe(1);

    // prélèvements créés sans réponse de Mollie (il y a plus de 5 minutes)
    await alone();
    const lost = await organizer();
    await billed(lost);
    const found = await payment(lost, {});
    const missing = await payment(lost, { attempt: 2 });
    // paiement reçu dont la facture n'est pas partie
    const unbilled = await payment(lost, {
      attempt: 3,
      status: "PAID",
      molliePaymentId: `tr_sansfacture${lost.id}`,
      paidAt: new Date(),
    });
    // abonnement annuel renouvelé dans 5 jours : préavis
    const yearly = await organizer();
    await billed(yearly, {
      interval: "YEAR",
      currentPeriodEnd: new Date(Date.now() + 5 * DAY),
    });
    // impayé depuis plus de 7 jours, mais un prélèvement est encore en traitement
    const waiting = await organizer();
    await billed(waiting, {
      status: "PAST_DUE",
      pastDueSince: new Date(Date.now() - 8 * DAY),
    });
    const later = new Date(Date.now() + 10 * 60_000);
    vi.unstubAllGlobals();
    mollie(
      {
        method: "GET",
        path: `/v2/customers/cst_${lost.id}/payments`,
        body: {
          count: 1,
          _embedded: {
            payments: [
              {
                id: `tr_retrouve${lost.id}`,
                status: "paid",
                amount: eur("29.00"),
                method: "creditcard",
                metadata: { subscriptionPaymentId: found.id },
                _links: {},
              },
            ],
          },
          _links: { next: null },
        },
      },
      {
        method: "GET",
        path: `/v2/customers/cst_${lost.id}/payments`,
        body: {
          count: 0,
          _embedded: { payments: [] },
          _links: { next: null },
        },
      },
      {
        method: "POST",
        path: "/v2/payments",
        status: 201,
        body: {
          id: `tr_refait${lost.id}`,
          status: "pending",
          amount: eur("29.00"),
          _links: {},
        },
      },
    );
    await payment(waiting, { status: "PENDING", molliePaymentId: null });
    const out = await runProBilling(later);
    expect(out).toMatchObject({ recovered: 2, notices: 1, ended: 0 });
    expect(
      await db.subscriptionPayment.findUniqueOrThrow({
        where: { id: found.id },
      }),
    ).toMatchObject({
      molliePaymentId: `tr_retrouve${lost.id}`,
      status: "PAID",
    });
    expect(
      await db.subscriptionPayment.findUniqueOrThrow({
        where: { id: missing.id },
      }),
    ).toMatchObject({
      molliePaymentId: `tr_refait${lost.id}`,
      status: "PENDING",
    });
    expect(
      await db.proInvoice.count({ where: { paymentId: unbilled.id } }),
    ).toBe(1);
    expect(await mails(yearly, "subscription.renewal_notice")).toBe(1);
    expect((await subOf(waiting)).status).toBe("PAST_DUE");
    // une heure plus tard : pas de second préavis
    vi.unstubAllGlobals();
    mollie();
    await runProBilling(new Date(later.getTime() + 3_600_000));
    expect(await mails(yearly, "subscription.renewal_notice")).toBe(1);
  });

  it("factures dans la langue de l'organisation, émises une seule fois ; carte enregistrée sans paiement : aucune facture", async () => {
    const titles = {
      en: "Invoice",
      nl: "Factuur",
      de: "Rechnung",
      es: "Factura",
      it: "Fattura",
      pt: "Fatura",
    } as const;
    for (const [locale, title] of Object.entries(titles)) {
      const o = await organizer();
      await db.organization.update({
        where: { id: o.org.id },
        data: { locale },
      });
      await billed(o, { interval: "YEAR" });
      const paid = await payment(o, {
        status: "PAID",
        interval: "YEAR",
        amountMinor: 29580,
        method: locale === "de" ? "directdebit" : "bancontact",
        paidAt: new Date(),
      });
      const invoice = await issueProInvoice(paid.id, null);
      expect(invoice).not.toBeNull();
      expect((await issueProInvoice(paid.id, null))?.id).toBe(invoice!.id);
      const text = pdfText((await proInvoicePdf(invoice!.id)).bytes);
      expect(text).toContain(title);
      expect(text).toContain(invoice!.number);
      expect(text).toContain("Mollie");
    }
    const o = await organizer();
    await billed(o);
    const card = await payment(o, {
      kind: "MANDATE",
      status: "PAID",
      amountMinor: 0,
      interval: null,
      periodStart: null,
      periodEnd: null,
    });
    expect(await issueProInvoice(card.id, null)).toBeNull();
  });

  it("administration, parrainage, suppression et fin d'essai tiennent compte de l'abonnement Mollie", async () => {
    const admin = await db.user.create({
      data: {
        name: "Admin",
        email: `a.${rid()}@evoly.me`,
        emailVerified: true,
        platformRole: "ADMIN",
        twoFactorEnabled: true,
      },
    });
    const st = {
      user: admin,
      session: { id: `s-${rid()}` },
      verified: true,
    } as unknown as Staff;
    // prolonger l'essai d'un abonné Mollie : le prochain prélèvement recule, l'impayé est effacé
    const late = await organizer();
    const before = await billed(late, {
      status: "PAST_DUE",
      pastDueSince: new Date(),
    });
    await extendTrial(st, late.org.id, 10);
    const extended = await subOf(late);
    expect(extended).toMatchObject({
      status: "ACTIVE",
      pastDueSince: null,
      billingProvider: "MOLLIE",
    });
    expect(extended.currentPeriodEnd!.getTime()).toBe(
      before.currentPeriodEnd!.getTime() + 10 * DAY,
    );
    // attribuer une autre offre : résiliation explicite exigée, puis plus aucun prélèvement
    await expect(
      assignPlan(st, late.org.id, "partner", null),
    ).rejects.toMatchObject({ code: "PLAN_MANAGED_BY_MOLLIE" });
    await assignPlan(st, late.org.id, "partner", null, { resilier: true });
    expect(await subOf(late)).toMatchObject({
      planId: "partner",
      billingProvider: null,
      mollieMandateId: null,
    });

    // parrainage : un mois de plus avant le prochain prélèvement
    const parrain = await organizer();
    const sub = await billed(parrain);
    const filleul = await db.organization.create({
      data: {
        name: "Les Amis du Jazz",
        slug: `filleul-${rid()}`,
        subdomain: `filleul-${rid()}`,
        country: "BE",
        currency: "EUR",
      },
    });
    await db.referral.create({
      data: {
        code: `PAR${rid()}`.toUpperCase(),
        referrerOrgId: parrain.org.id,
        referredOrgId: filleul.id,
        status: "SIGNED_UP",
      },
    });
    expect(await qualifyReferral(filleul.id)).toBe(true);
    const rewarded = await subOf(parrain);
    expect(rewarded).toMatchObject({
      status: "ACTIVE",
      billingProvider: "MOLLIE",
    });
    expect(rewarded.currentPeriodEnd!.getTime()).toBe(
      sub.currentPeriodEnd!.getTime() + 30 * DAY,
    );

    // suppression de l'organisation : bloquée tant que Mollie prélève, permise une fois résilié
    expect(await deletionBlockers(parrain.org.id)).toEqual([
      "ACTIVE_SUBSCRIPTION",
    ]);
    await cancelProSubscription(parrain.ctx);
    expect(await deletionBlockers(parrain.org.id)).toEqual([]);
    // mensuel ou annuel : au prochain renouvellement pour un abonné Mollie
    const yearly = await organizer();
    await billed(yearly);
    await scheduleIntervalSwitch(yearly.ctx, "YEAR");
    expect((await subOf(yearly)).nextInterval).toBe("YEAR");

    // essai sans carte qui se termine dans 2 jours : invitation à s'abonner, une fois
    const trial = await organizer();
    const end = new Date(Date.now() + 2 * DAY);
    await db.subscription.update({
      where: { organizationId: trial.org.id },
      data: {
        planId: "pro",
        status: "TRIALING",
        trialEndsAt: end,
        currentPeriodEnd: end,
      },
    });
    await notifyGrantedProEnding();
    await notifyGrantedProEnding(new Date(Date.now() + 3_600_000));
    expect(await mails(trial, "subscription.pro_ending")).toBe(1);
    expect(
      await db.notification.count({
        where: {
          organizationId: trial.org.id,
          type: "TRIAL_ENDING",
          title: "Fin de votre essai Pro",
        },
      }),
    ).toBeGreaterThan(0);
  });
  it("abonnement pendant un Pro offert : vérification remboursée plus tard si Mollie ne répond pas, jamais facturée ; contestée : rien ne change ; résilié avant le premier prélèvement : rien n'est prélevé", async () => {
    await alone();
    const o = await organizer();
    const now = new Date();
    const grantEnd = new Date(now.getTime() + 30 * DAY);
    await db.subscription.update({
      where: { organizationId: o.org.id },
      data: { planId: "pro", status: "ACTIVE", currentPeriodEnd: grantEnd },
    });
    mollie(
      {
        method: "POST",
        path: "/v2/customers",
        status: 201,
        body: { id: `cst_${o.id}` },
      },
      {
        method: "POST",
        path: "/v2/payments",
        status: 201,
        body: {
          id: `tr_offert${o.id}`,
          status: "open",
          amount: eur("0.02"),
          _links: { checkout: { href: "https://www.mollie.com/checkout/x" } },
        },
      },
    );
    await startProCheckout(o.ctx, "MONTH", now);
    const row = await db.subscriptionPayment.findFirstOrThrow({
      where: { organizationId: o.org.id, kind: "SETUP" },
    });
    expect(row).toMatchObject({ amountMinor: 2, periodStart: grantEnd });

    // payée par carte ; Mollie ne répond pas au remboursement : rien n'est perdu
    const paid = (extra: Record<string, unknown> = {}) => ({
      method: "GET",
      path: `/v2/payments/tr_offert${o.id}`,
      body: {
        id: `tr_offert${o.id}`,
        status: "paid",
        amount: eur("0.02"),
        method: "creditcard",
        sequenceType: "first",
        customerId: `cst_${o.id}`,
        mandateId: `mdt_${o.id}`,
        paidAt: now.toISOString(),
        _links: {},
        ...extra,
      },
    });
    vi.unstubAllGlobals();
    mollie(paid(), {
      method: "GET",
      path: `/v2/customers/cst_${o.id}/mandates/mdt_${o.id}`,
      body: {
        id: `mdt_${o.id}`,
        method: "creditcard",
        status: "valid",
        details: { cardLabel: "Visa", cardNumber: "4242" },
      },
    });
    await handleProWebhook(`tr_offert${o.id}`, now);
    let sub = await subOf(o);
    expect(sub).toMatchObject({
      status: "ACTIVE",
      billingProvider: "MOLLIE",
      mollieMandateId: `mdt_${o.id}`,
      paymentMethodLabel: "Visa •••• 4242",
    });
    expect(sub.currentPeriodEnd).toEqual(grantEnd);
    expect(
      (
        await db.subscriptionPayment.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).refundedAt,
    ).toBeNull();
    expect((await billingState(o.ctx)).firstCharge).toEqual(grantEnd);

    // tâche horaire : remboursement fait, une seule fois ; la vérification n'est jamais facturée
    const later = new Date(now.getTime() + 10 * 60_000);
    vi.unstubAllGlobals();
    mollie({
      method: "POST",
      path: `/v2/payments/tr_offert${o.id}/refunds`,
      status: 201,
      body: { id: `re_${o.id}`, status: "queued" },
    });
    expect(await runProBilling(later)).toMatchObject({
      refunded: 1,
      renewed: 0,
    });
    expect(await runProBilling(later)).toMatchObject({ refunded: 0 });
    expect(
      (
        await db.subscriptionPayment.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).refundedAt,
    ).not.toBeNull();
    expect(
      await db.proInvoice.count({ where: { organizationId: o.org.id } }),
    ).toBe(0);

    // vérification contestée auprès de la banque : l'abonnement n'est pas en impayé
    vi.unstubAllGlobals();
    mollie(paid({ amountChargedBack: eur("0.02") }));
    await handleProWebhook(`tr_offert${o.id}`, later);
    expect(
      (
        await db.subscriptionPayment.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).status,
    ).toBe("CHARGED_BACK");
    expect((await subOf(o)).status).toBe("ACTIVE");

    // résilié avant le premier prélèvement : rien n'est prélevé, fin à la date prévue
    await cancelProSubscription(o.ctx, later);
    expect((await billingState(o.ctx)).firstCharge).toBeNull();
    vi.unstubAllGlobals();
    mollie();
    const sent = calls.length;
    expect(
      await runProBilling(new Date(grantEnd.getTime() - 12 * 3_600_000)),
    ).toMatchObject({ renewed: 0 });
    await runProBilling(new Date(grantEnd.getTime() + 60_000));
    sub = await subOf(o);
    expect(sub.status).toBe("CANCELED");
    expect(effectivePlan(sub, new Date(grantEnd.getTime() + 60_000))).toBe(
      "free",
    );
    expect(calls.slice(sent).filter((c) => c.method === "POST")).toHaveLength(
      0,
    );
  });

  it("vérification payée après la fin de la période offerte : premier prélèvement tout de suite, sans trou dans l'offre", async () => {
    await alone();
    const o = await organizer();
    const now = new Date();
    const grantEnd = new Date(now.getTime() + 2 * DAY);
    await db.subscription.update({
      where: { organizationId: o.org.id },
      data: { planId: "pro", status: "ACTIVE", currentPeriodEnd: grantEnd },
    });
    mollie(
      {
        method: "POST",
        path: "/v2/customers",
        status: 201,
        body: { id: `cst_${o.id}` },
      },
      {
        method: "POST",
        path: "/v2/payments",
        status: 201,
        body: {
          id: `tr_tard${o.id}`,
          status: "open",
          amount: eur("0.02"),
          _links: { checkout: { href: "https://www.mollie.com/checkout/y" } },
        },
      },
    );
    await startProCheckout(o.ctx, "MONTH", now);

    const late = new Date(grantEnd.getTime() + 3_600_000);
    vi.unstubAllGlobals();
    mollie(
      {
        method: "GET",
        path: `/v2/payments/tr_tard${o.id}`,
        body: {
          id: `tr_tard${o.id}`,
          status: "paid",
          amount: eur("0.02"),
          method: "bancontact",
          sequenceType: "first",
          customerId: `cst_${o.id}`,
          mandateId: `mdt_${o.id}`,
          paidAt: late.toISOString(),
          _links: {},
        },
      },
      {
        method: "GET",
        path: `/v2/customers/cst_${o.id}/mandates/mdt_${o.id}`,
        body: {
          id: `mdt_${o.id}`,
          method: "directdebit",
          status: "valid",
          details: { consumerAccount: "BE68539007547034" },
        },
      },
      {
        method: "POST",
        path: `/v2/payments/tr_tard${o.id}/refunds`,
        status: 201,
        body: { id: `re_${o.id}`, status: "pending" },
      },
      {
        method: "POST",
        path: "/v2/payments",
        status: 201,
        body: {
          id: `tr_mois${o.id}`,
          status: "pending",
          amount: eur("29.00"),
          method: "directdebit",
          sequenceType: "recurring",
          _links: {},
        },
      },
    );
    await handleProWebhook(`tr_tard${o.id}`, late);
    const sub = await subOf(o);
    expect(sub.currentPeriodStart).toEqual(late);
    expect(sub.currentPeriodEnd).toEqual(addBillingInterval(late, "MONTH"));
    expect(effectivePlan(sub, late)).toBe("pro");
    expect(
      await db.subscriptionPayment.findFirstOrThrow({
        where: { organizationId: o.org.id, kind: "RENEWAL" },
      }),
    ).toMatchObject({ status: "PENDING", amountMinor: 2900 });
    const charge = calls
      .filter((c) => c.method === "POST" && c.url.pathname === "/v2/payments")
      .at(-1)!;
    expect(JSON.parse(charge.body)).toMatchObject({
      amount: eur("29.00"),
      sequenceType: "recurring",
      mandateId: `mdt_${o.id}`,
    });
  });
});
