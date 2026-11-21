import { afterEach, beforeEach, vi } from "vitest";

// Mollie simulé pour les tests de la boutique : paiements (état modifié par le test), remboursements et clés
// d'idempotence, derrière fetch ; compte Mollie prêt d'une organisation de test
process.env.MOLLIE_CLIENT_ID = "app_essai_evoly";
process.env.MOLLIE_CLIENT_SECRET = "secret_essai_evoly";

const rid = () => Math.random().toString(36).slice(2, 10);

type Amount = { currency: string; value: string };
export type FakePayment = {
  id: string;
  status: string;
  amount: Amount;
  amountRefunded?: Amount;
  method: string | null;
  metadata: Record<string, string>;
  details: { cardFingerprint?: string } | null;
  _links: { checkout?: { href: string } };
  [key: string]: unknown;
};
export type FakeRefund = {
  id: string;
  paymentId: string;
  status: string;
  amount: Amount;
  metadata: Record<string, string>;
};
/** État de Mollie simulé, remis à zéro avant chaque test. */
export const mollie = {
  payments: new Map<string, FakePayment>(),
  refunds: [] as FakeRefund[],
  keys: new Map<string, unknown>(),
  refundFails: false,
};
export const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
export async function mollieFetch(input: string | URL, init: RequestInit = {}) {
  const url = new URL(String(input));
  const method = init.method ?? "GET";
  const body =
    typeof init.body === "string"
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : {};
  const key = new Headers(init.headers).get("Idempotency-Key");
  if (key && mollie.keys.has(key)) return reply(mollie.keys.get(key), 201);
  const remember = <T>(v: T) => {
    if (key) mollie.keys.set(key, v);
    return reply(v, 201);
  };
  const notFound = () =>
    reply({ status: 404, title: "Not Found", detail: url.pathname }, 404);
  if (method === "POST" && url.pathname === "/v2/payments") {
    const id = `tr_${rid()}${rid()}`;
    const payment = {
      ...body,
      id,
      status: "open",
      method: null,
      details: null,
      _links: {
        checkout: {
          href: `https://www.mollie.com/checkout/select-method/${id}`,
        },
      },
    } as FakePayment;
    mollie.payments.set(id, payment);
    return remember(payment);
  }
  const m = /^\/v2\/payments\/(tr_[A-Za-z0-9]+)(\/refunds)?$/.exec(
    url.pathname,
  );
  const payment = m ? mollie.payments.get(m[1]!) : undefined;
  if (!m || !payment) return notFound();
  if (!m[2]) return method === "GET" ? reply(payment) : notFound();
  const refunds = mollie.refunds.filter((r) => r.paymentId === payment.id);
  if (method === "GET")
    return reply({ count: refunds.length, _embedded: { refunds } });
  if (mollie.refundFails)
    return reply(
      { status: 422, title: "Unprocessable Entity", detail: "Refusé" },
      422,
    );
  const refund: FakeRefund = {
    id: `re_${rid()}`,
    paymentId: payment.id,
    status: "pending",
    amount: body.amount as Amount,
    metadata: body.metadata as Record<string, string>,
  };
  mollie.refunds.push(refund);
  const cents = [...refunds, refund].reduce(
    (n, r) => n + Math.round(Number(r.amount.value) * 100),
    0,
  );
  payment.amountRefunded = {
    currency: payment.amount.currency,
    value: (cents / 100).toFixed(2),
  };
  return remember(refund);
}
/** Mollie simulé pour chaque test du fichier, remis à zéro avant chacun. */
export function useMollieFake() {
  beforeEach(() => {
    mollie.payments.clear();
    mollie.refunds = [];
    mollie.keys.clear();
    mollie.refundFails = false;
    vi.stubGlobal("fetch", vi.fn(mollieFetch));
  });
  afterEach(() => vi.unstubAllGlobals());
}

const tokens = {
  access_token: "access_mollie",
  refresh_token: "refresh_mollie",
  expires_in: 3600,
  token_type: "bearer",
  scope: "payments.read payments.write refunds.read refunds.write",
};

/** Compte Mollie relié et prêt à encaisser (profil vérifié, cartes et Bancontact actifs). */
export async function readyMollieAccount(organizationId: string, id: string) {
  const { db } = await import("@/lib/db");
  const { saveMollieAuthorization } = await import("@/server/mollieAccounts");
  const account = await saveMollieAuthorization({
    organizationId,
    mollieOrganizationId: `org_${id}`,
    tokens,
    testmode: false,
  });
  await db.mollieAccount.update({
    where: { id: account.id },
    data: {
      profileId: `pfl_${id}`,
      profileStatus: "verified",
      methods: ["bancontact", "creditcard"],
      onboardingStatus: "COMPLETED",
      canReceivePayments: true,
    },
  });
}
