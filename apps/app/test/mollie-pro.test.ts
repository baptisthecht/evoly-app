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
  proPaymentReturn,
  resumeProSubscription,
  runProBilling,
  scheduleIntervalSwitch,
  startPaymentMethodChange,
  startProCheckout,
  startProTrial,
} = await import("@/server/proBilling");
const { proInvoicePdf } = await import("@/server/proInvoices");
const { applyTimedDowngrades, billingState } = await import("@/server/billing");
const { POST: webhook } = await import("@/app/api/webhooks/mollie/pro/route");
const { addBillingInterval, effectivePlan } = await import("@evoly/core");

type Route = { method: string; path: string; status?: number; body?: unknown };
type Call = { method: string; url: URL; body: string; headers: Headers };
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
        headers: new Headers(init.headers),
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
/** Texte imprimé dans un PDF (pdftotext, installé dans la CI). */
function pdfText(bytes: Uint8Array) {
  const file = join(dir, `${rid()}.pdf`);
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", [file, "-"], { encoding: "utf8" })
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ");
}

/** Organisation belge (TVA belge sur Pro) et sa propriétaire, qui reçoit les e-mails d'abonnement. */
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

/** Abonnement déjà payé par Mollie (mandat de prélèvement SEPA), dans l'état voulu. */
async function billed(
  o: Awaited<ReturnType<typeof organizer>>,
  data: Record<string, unknown>,
) {
  return db.subscription.update({
    where: { organizationId: o.org.id },
    data: {
      planId: "pro",
      status: "ACTIVE",
      interval: "MONTH",
      billingProvider: "MOLLIE",
      mollieCustomerId: `cst_${o.id}`,
      mollieMandateId: `mdt_${o.id}`,
      paymentMethodLabel: "BE68 •••• 7034",
      ...data,
    },
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

const subOf = (o: { org: { id: string } }) =>
  db.subscription.findUniqueOrThrow({ where: { organizationId: o.org.id } });

describe("offre Pro payée par Mollie (docs/MOLLIE.md, lot 6)", () => {
  it("essai de 14 jours sans carte, une seule fois ; abonnement pendant l'essai : vérification remboursée, rien à payer avant la fin de l'essai, rappel 7 jours avant, puis premier prélèvement, facture numérotée et envoyée", async () => {
    await alone();
    const o = await organizer();
    const now = new Date();
    mollie();
    await startProTrial(o.ctx, "YEAR", now);
    expect(calls).toHaveLength(0); // aucune carte, aucun appel à Mollie
    let sub = await subOf(o);
    expect(sub).toMatchObject({
      planId: "pro",
      status: "TRIALING",
      billingProvider: null,
    });
    const trialEnd = sub.trialEndsAt!;
    expect(trialEnd.getTime() - now.getTime()).toBe(14 * DAY);
    expect(effectivePlan(sub, now)).toBe("pro");
    expect(effectivePlan(sub, new Date(trialEnd.getTime() + 1))).toBe("free");
    await expect(startProTrial(o.ctx, "YEAR", now)).rejects.toMatchObject({
      code: "ALREADY_SUBSCRIBED",
    });

    // abonnement pendant l'essai : seulement un paiement de vérification de 0,02 €, qui crée le mandat
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
        status: 201,
        body: {
          id: `tr_verif${o.id}`,
          status: "open",
          amount: eur("0.02"),
          _links: { checkout: { href: "https://www.mollie.com/checkout/abc" } },
        },
      },
    );
    expect(await startProCheckout(o.ctx, "YEAR", now)).toBe(
      "https://www.mollie.com/checkout/abc",
    );
    const row = await db.subscriptionPayment.findFirstOrThrow({
      where: { organizationId: o.org.id, kind: "SETUP" },
    });
    expect(row).toMatchObject({ amountMinor: 2, interval: "YEAR" });
    const create = calls.find((c) => c.url.pathname === "/v2/payments")!;
    expect(JSON.parse(create.body)).toMatchObject({
      amount: eur("0.02"),
      sequenceType: "first",
      customerId: `cst_${o.id}`,
      metadata: {
        organizationId: o.org.id,
        subscriptionPaymentId: row.id,
        kind: "SETUP",
      },
    });
    expect(JSON.parse(create.body).method).toBeUndefined(); // carte, Bancontact… au choix
    expect(JSON.parse(create.body).redirectUrl).toContain(
      `/o/${o.org.slug}/billing?mollie=${row.id}`,
    );
    expect(create.headers.get("idempotency-key")).toBe(`pro-payment:${row.id}`);
    expect(create.headers.get("authorization")).toBe("Bearer test_essai_evoly");

    // vérification payée par Bancontact : mandat de prélèvement SEPA, vérification remboursée, aucune facture
    const verified = {
      method: "GET",
      path: `/v2/payments/tr_verif${o.id}`,
      body: {
        id: `tr_verif${o.id}`,
        status: "paid",
        amount: eur("0.02"),
        method: "bancontact",
        sequenceType: "first",
        customerId: `cst_${o.id}`,
        mandateId: `mdt_${o.id}`,
        paidAt: now.toISOString(),
        _links: {},
      },
    };
    vi.unstubAllGlobals();
    mollie(
      verified,
      {
        method: "GET",
        path: `/v2/customers/cst_${o.id}/mandates/mdt_${o.id}`,
        body: {
          id: `mdt_${o.id}`,
          method: "directdebit",
          status: "valid",
          details: {
            consumerName: "Nora",
            consumerAccount: "BE68539007547034",
          },
        },
      },
      {
        method: "POST",
        path: `/v2/payments/tr_verif${o.id}/refunds`,
        status: 201,
        body: { id: `re_${o.id}`, status: "pending" },
      },
    );
    await handleProWebhook(`tr_verif${o.id}`, now);
    sub = await subOf(o);
    expect(sub).toMatchObject({
      planId: "pro",
      status: "ACTIVE",
      billingProvider: "MOLLIE",
      interval: "YEAR",
      mollieMandateId: `mdt_${o.id}`,
      paymentMethodLabel: "BE68 •••• 7034",
      cancelAtPeriodEnd: false,
    });
    expect(sub.currentPeriodEnd).toEqual(trialEnd); // l'essai court jusqu'au premier prélèvement
    expect(effectivePlan(sub, now)).toBe("pro");
    const refund = calls.find((c) => c.url.pathname.endsWith("/refunds"))!;
    expect(JSON.parse(refund.body)).toMatchObject({ amount: eur("0.02") });
    expect(refund.headers.get("idempotency-key")).toBe(
      `pro-setup-refund:${row.id}`,
    );
    expect(
      await db.subscriptionPayment.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ status: "PAID", periodStart: trialEnd });
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
    const scheduledMail = await db.emailMessage.findFirstOrThrow({
      where: { organizationId: o.org.id, template: "subscription.scheduled" },
    });
    expect(scheduledMail.subject).toBe(
      "Votre abonnement Evoly Pro est enregistré",
    );
    let view = await billingState(o.ctx);
    expect(view).toMatchObject({
      provider: "MOLLIE",
      mollieBilled: true,
      trialEligible: false,
    });
    expect(view.firstCharge).toEqual(trialEnd);

    // le même webhook une seconde fois : rien de plus, aucun second remboursement
    vi.unstubAllGlobals();
    mollie(verified);
    await handleProWebhook(`tr_verif${o.id}`, now);
    expect(
      calls.filter((c) => c.url.pathname.endsWith("/refunds")),
    ).toHaveLength(1);

    // 7 jours avant la fin de l'essai : rappel du premier prélèvement, une seule fois
    vi.unstubAllGlobals();
    mollie();
    const week = new Date(trialEnd.getTime() - 6 * DAY);
    expect((await runProBilling(week)).notices).toBe(1);
    expect((await runProBilling(week)).notices).toBe(0);
    const notice = await db.emailMessage.findFirstOrThrow({
      where: {
        organizationId: o.org.id,
        template: "subscription.first_charge",
      },
    });
    expect(notice.subject).toMatch(/^Premier prélèvement Evoly Pro le /);

    // la veille de la fin de l'essai : premier prélèvement sur le mandat (prélèvement SEPA, quelques jours)
    vi.unstubAllGlobals();
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: `tr_premier${o.id}`,
        status: "pending",
        amount: eur("295.80"),
        method: "directdebit",
        sequenceType: "recurring",
        _links: {},
      },
    });
    const eve = new Date(trialEnd.getTime() - 12 * 3_600_000);
    expect((await runProBilling(eve)).renewed).toBe(1);
    const charge = calls
      .filter((c) => c.method === "POST" && c.url.pathname === "/v2/payments")
      .at(-1)!;
    expect(JSON.parse(charge.body)).toMatchObject({
      amount: eur("295.80"),
      sequenceType: "recurring",
      mandateId: `mdt_${o.id}`,
    });
    sub = await subOf(o);
    expect(sub.currentPeriodStart).toEqual(trialEnd);
    expect(sub.currentPeriodEnd).toEqual(addBillingInterval(trialEnd, "YEAR"));
    view = await billingState(o.ctx);
    expect(view.firstCharge).toBeNull();
    expect(view.renewalPending).toBe(true);

    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/tr_premier${o.id}`,
      body: {
        id: `tr_premier${o.id}`,
        status: "paid",
        amount: eur("295.80"),
        method: "directdebit",
        sequenceType: "recurring",
        mandateId: `mdt_${o.id}`,
        paidAt: trialEnd.toISOString(),
        _links: {},
      },
    });
    await handleProWebhook(`tr_premier${o.id}`, trialEnd);
    const invoice = await db.proInvoice.findFirstOrThrow({
      where: { organizationId: o.org.id },
    });
    expect(invoice.number).toMatch(/^EVO-\d{4}-\d{6}$/);
    expect(invoice).toMatchObject({
      totalMinor: 29580,
      vatRateBps: 2100,
      vatMinor: 5134, // 21 % compris dans 295,80 €
      vatMention: "BE_VAT",
      method: "directdebit",
      interval: "YEAR",
    });
    const mail = await db.emailMessage.findFirstOrThrow({
      where: { organizationId: o.org.id, template: "subscription.invoice" },
    });
    expect(mail.subject).toContain(invoice.number);
    const text = pdfText((await proInvoicePdf(invoice.id)).bytes);
    for (const part of [
      "Facture",
      invoice.number,
      "Abonnement Evoly Pro, annuel",
      "295,80",
      "TVA belge 21 % comprise",
      "prélèvement SEPA",
      "via Mollie",
    ])
      expect(text).toContain(part);
    view = await billingState(o.ctx);
    expect(view.invoices.map((i) => i.number)).toEqual([invoice.number]);
  });

  it("essai fini sans abonnement : retour en Free, et pas de second essai", async () => {
    const o = await organizer();
    const now = new Date();
    await startProTrial(o.ctx, "MONTH", new Date(now.getTime() - 15 * DAY));
    expect(effectivePlan(await subOf(o), now)).toBe("free");
    await expect(startProTrial(o.ctx, "MONTH", now)).rejects.toMatchObject({
      code: "TRIAL_ALREADY_USED",
    });
  });

  it("renouvellement : prélevé sur le mandat la veille de l'échéance, au choix d'annuel fait entre-temps, sans prorata ; échec : impayé, propriétaire prévenu à chaque échec, nouvelle tentative 3 jours plus tard", async () => {
    await alone();
    const o = await organizer();
    const now = new Date();
    const end = new Date(now.getTime() + 12 * 3_600_000);
    await billed(o, {
      currentPeriodStart: new Date(end.getTime() - 30 * DAY),
      currentPeriodEnd: end,
    });
    await scheduleIntervalSwitch(o.ctx, "YEAR");
    expect((await subOf(o)).nextInterval).toBe("YEAR");

    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: `tr_renouvA${o.id}`,
        status: "pending",
        amount: eur("295.80"),
        _links: {},
      },
    });
    expect((await runProBilling(now)).renewed).toBe(1);
    const body = JSON.parse(calls[0]!.body);
    expect(body).toMatchObject({
      amount: eur("295.80"),
      sequenceType: "recurring",
      customerId: `cst_${o.id}`,
      mandateId: `mdt_${o.id}`,
    });
    expect(body.redirectUrl).toBeUndefined();
    let sub = await subOf(o);
    expect(sub).toMatchObject({
      status: "ACTIVE",
      interval: "YEAR",
      nextInterval: null,
    });
    expect(sub.currentPeriodStart).toEqual(end);
    expect(sub.currentPeriodEnd).toEqual(addBillingInterval(end, "YEAR"));
    const first = await db.subscriptionPayment.findFirstOrThrow({
      where: { organizationId: o.org.id, kind: "RENEWAL" },
    });
    expect(first).toMatchObject({
      status: "PENDING",
      attempt: 1,
      amountMinor: 29580,
    });
    expect(calls[0]!.headers.get("idempotency-key")).toBe(
      `pro-payment:${first.id}`,
    );

    // une seule fois par période
    vi.unstubAllGlobals();
    calls.length = 0;
    mollie();
    expect((await runProBilling(now)).renewed).toBe(0);
    expect(calls).toHaveLength(0);

    // la banque refuse le prélèvement
    vi.unstubAllGlobals();
    mollie({
      method: "GET",
      path: `/v2/payments/tr_renouvA${o.id}`,
      body: {
        id: `tr_renouvA${o.id}`,
        status: "failed",
        amount: eur("295.80"),
        method: "directdebit",
        details: { bankReasonCode: "AM04", bankReason: "Insufficient funds" },
        _links: {},
      },
    });
    await handleProWebhook(`tr_renouvA${o.id}`, now);
    sub = await subOf(o);
    expect(sub.status).toBe("PAST_DUE");
    expect(sub.pastDueSince).toEqual(now);
    expect(effectivePlan(sub, now)).toBe("pro"); // 7 jours avant le retour en Free
    expect(
      await db.emailMessage.count({
        where: {
          organizationId: o.org.id,
          template: "subscription.payment_failed",
        },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: {
          organizationId: o.org.id,
          type: "SUBSCRIPTION_PAYMENT_FAILED",
        },
      }),
    ).toBeGreaterThan(0);

    // le lendemain : pas encore de nouvelle tentative
    vi.unstubAllGlobals();
    mollie();
    expect((await runProBilling(new Date(now.getTime() + DAY))).retried).toBe(
      0,
    );

    // 3 jours après l'échec : nouvelle tentative, refusée elle aussi ; propriétaire prévenu de nouveau (RG-SUB-06 : à
    // chaque échec), toujours Pro, le délai de 7 jours court depuis le premier échec
    vi.unstubAllGlobals();
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: `tr_renouvB${o.id}`,
        status: "failed",
        amount: eur("295.80"),
        method: "directdebit",
        details: { bankReasonCode: "AM04", bankReason: "Insufficient funds" },
        _links: {},
      },
    });
    const later = new Date(now.getTime() + 3 * DAY + 60_000);
    expect((await runProBilling(later)).retried).toBe(1);
    sub = await subOf(o);
    expect(sub.status).toBe("PAST_DUE");
    expect(sub.pastDueSince).toEqual(now);
    expect(effectivePlan(sub, later)).toBe("pro");
    expect(
      await db.emailMessage.count({
        where: {
          organizationId: o.org.id,
          template: "subscription.payment_failed",
        },
      }),
    ).toBe(2);

    // 3 jours plus tard : dernière tentative, payée ; l'abonnement est de nouveau à jour
    vi.unstubAllGlobals();
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: `tr_renouvC${o.id}`,
        status: "paid",
        amount: eur("295.80"),
        method: "directdebit",
        paidAt: later.toISOString(),
        _links: {},
      },
    });
    const last = new Date(later.getTime() + 3 * DAY + 60_000);
    expect((await runProBilling(last)).retried).toBe(1);
    sub = await subOf(o);
    expect(sub).toMatchObject({ status: "ACTIVE", pastDueSince: null });
    const third = await db.subscriptionPayment.findFirstOrThrow({
      where: { organizationId: o.org.id, kind: "RENEWAL", attempt: 3 },
      include: { invoice: true },
    });
    expect(third.status).toBe("PAID");
    expect(third.invoice?.totalMinor).toBe(29580);
  });

  it("impayé depuis 7 jours sans paiement en cours : abonnement terminé au terme du délai, propriétaire prévenu une seule fois du retour en Free", async () => {
    await alone();
    const o = await organizer();
    const now = new Date();
    const since = new Date(now.getTime() - 7 * DAY - 2 * 3_600_000);
    const sub = await billed(o, {
      status: "PAST_DUE",
      pastDueSince: since,
      currentPeriodStart: since,
      currentPeriodEnd: new Date(since.getTime() + 30 * DAY),
    });
    await db.subscriptionPayment.create({
      data: {
        organizationId: o.org.id,
        subscriptionId: sub.id,
        kind: "RENEWAL",
        status: "FAILED",
        interval: "MONTH",
        amountMinor: 2900,
        currency: "EUR",
        periodStart: since,
        periodEnd: new Date(since.getTime() + 30 * DAY),
        attempt: 3,
        failedAt: new Date(since.getTime() + 6 * DAY),
        molliePaymentId: `tr_dernier${o.id}`,
      },
    });
    mollie();
    const r = await runProBilling(now);
    expect(r).toMatchObject({ ended: 1, retried: 0 });
    const ended = await subOf(o);
    expect(ended.status).toBe("CANCELED");
    expect(ended.currentPeriodEnd).toEqual(new Date(since.getTime() + 7 * DAY));
    expect(effectivePlan(ended, now)).toBe("free");
    await applyTimedDowngrades(now);
    await applyTimedDowngrades(new Date(now.getTime() + 60_000)); // tâche lancée chaque minute
    expect(
      await db.emailMessage.count({
        where: { organizationId: o.org.id, template: "subscription.ended" },
      }),
    ).toBe(1);
  });

  it("résiliation : plus aucun prélèvement, Pro jusqu'à l'échéance, puis terminé ; reprise possible avant cette date", async () => {
    await alone();
    const o = await organizer();
    const now = new Date();
    const end = new Date(now.getTime() + 12 * 3_600_000);
    await billed(o, {
      currentPeriodStart: new Date(end.getTime() - 30 * DAY),
      currentPeriodEnd: end,
    });
    await cancelProSubscription(o.ctx, now);
    expect(await subOf(o)).toMatchObject({ cancelAtPeriodEnd: true });
    mollie();
    expect((await runProBilling(now)).renewed).toBe(0);
    expect(calls).toHaveLength(0);
    await resumeProSubscription(o.ctx, now);
    expect(await subOf(o)).toMatchObject({
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    await cancelProSubscription(o.ctx, now);
    const after = new Date(end.getTime() + 60_000);
    expect((await runProBilling(after)).ended).toBe(1);
    const sub = await subOf(o);
    expect(sub.status).toBe("CANCELED");
    expect(effectivePlan(sub, after)).toBe("free");
    await expect(resumeProSubscription(o.ctx, after)).rejects.toMatchObject({
      code: "NOT_SUBSCRIBED",
    });
  });

  it("changement de moyen de paiement : carte enregistrée sur la page de Mollie sans paiement, nouveau mandat, aucune facture", async () => {
    const o = await organizer();
    const now = new Date();
    await billed(o, {
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
    });
    mollie({
      method: "POST",
      path: "/v2/payments",
      status: 201,
      body: {
        id: `tr_carte${o.id}`,
        status: "open",
        amount: eur("0.00"),
        _links: { checkout: { href: "https://www.mollie.com/checkout/carte" } },
      },
    });
    expect(await startPaymentMethodChange(o.ctx, now)).toBe(
      "https://www.mollie.com/checkout/carte",
    );
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      amount: eur("0.00"),
      method: "creditcard",
      sequenceType: "first",
      customerId: `cst_${o.id}`,
    });
    const row = await db.subscriptionPayment.findFirstOrThrow({
      where: { organizationId: o.org.id, kind: "MANDATE" },
    });
    vi.unstubAllGlobals();
    mollie(
      {
        method: "GET",
        path: `/v2/payments/tr_carte${o.id}`,
        body: {
          id: `tr_carte${o.id}`,
          status: "paid",
          amount: eur("0.00"),
          method: "creditcard",
          mandateId: `mdt_carte_${o.id}`,
          customerId: `cst_${o.id}`,
          _links: {},
        },
      },
      {
        method: "GET",
        path: `/v2/customers/cst_${o.id}/mandates/mdt_carte_${o.id}`,
        body: {
          id: `mdt_carte_${o.id}`,
          method: "creditcard",
          status: "valid",
          details: { cardLabel: "Mastercard", cardNumber: "4444" },
        },
      },
    );
    expect((await proPaymentReturn(o.ctx, row.id))?.status).toBe("PAID");
    expect(await subOf(o)).toMatchObject({
      mollieMandateId: `mdt_carte_${o.id}`,
      paymentMethodLabel: "Mastercard •••• 4444",
      status: "ACTIVE",
    });
    expect(
      await db.proInvoice.count({ where: { organizationId: o.org.id } }),
    ).toBe(0);
  });

  it("webhook des paiements Pro : identifiant manquant refusé, paiement inconnu de Mollie ignoré sans relance", async () => {
    const post = (body: Record<string, string>) =>
      webhook(
        new Request("https://app.evoly.test/api/webhooks/mollie/pro", {
          method: "POST",
          body: new URLSearchParams(body),
        }),
      );
    expect((await post({})).status).toBe(400);
    mollie();
    expect((await post({ id: `tr_inconnu${rid()}` })).status).toBe(200);
  });
});
