import "server-only";
import { formatMoney } from "@evoly/i18n";
import { db } from "@/lib/db";
import {
  fromMollieAmount,
  type MollieApi,
  type MollieBalance,
  type MollieChargeback,
  type MollieList,
  type MollieSettlement,
} from "@/lib/mollie";
import { safeError } from "@/lib/redact";
import { mollieForOrganization } from "./mollieAccounts";
import { notify } from "./notifications";

/**
 * Finances d'un organisateur relié à Mollie (docs/MOLLIE.md, lot 5) : solde et versements lus chez Mollie, jamais
 * déclenchés par Evoly (RG-FIN-01) ; rétrofacturations copiées comme litiges ; versement échoué signalé.
 */

/** Statut d'un versement Mollie, exprimé comme ceux de Stripe pour l'affichage. */
const SETTLEMENT_STATUS: Record<MollieSettlement["status"], string> = {
  open: "pending",
  pending: "pending",
  processing: "in_transit",
  "processing-at-bank": "in_transit",
  paidout: "paid",
  failed: "failed",
  canceled: "canceled",
};

export type PaymentBalance = {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
};
export type PaymentPayout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: Date;
};

/** Solde et derniers versements chez Mollie ; indisponibles (Mollie en panne, compte à relier), rien n'est inventé. */
export async function mollieOverview(organizationId: string): Promise<{
  balance: PaymentBalance | null;
  payouts: PaymentPayout[] | null;
  unavailable: boolean;
}> {
  try {
    const mollie = await mollieForOrganization(organizationId);
    if (!mollie) return { balance: null, payouts: null, unavailable: true };
    const [b, s] = await Promise.all([
      mollie.plain<MollieBalance>("/balances/primary"),
      mollie.plain<MollieList<"settlements", MollieSettlement>>(
        "/settlements",
        { query: { limit: 10 } },
      ),
    ]);
    return {
      balance: {
        available: [
          {
            amount: fromMollieAmount(b.availableAmount),
            currency: b.availableAmount.currency,
          },
        ],
        pending: [
          {
            amount: fromMollieAmount(b.pendingAmount),
            currency: b.pendingAmount.currency,
          },
        ],
      },
      payouts: s._embedded.settlements.map((x) => ({
        id: x.id,
        amount: fromMollieAmount(x.amount),
        currency: x.amount.currency,
        status: SETTLEMENT_STATUS[x.status] ?? "pending",
        arrivalDate: new Date(x.settledAt ?? x.createdAt),
      })),
      unavailable: false,
    };
  } catch (err) {
    console.error("finances Mollie", safeError(err));
    return { balance: null, payouts: null, unavailable: true };
  }
}

/**
 * Rétrofacturations d'un paiement Mollie, copiées comme litiges (RG-FIN-03) : rattachées à la commande, gagnées si Mollie
 * les a annulées. Chaque nouvelle est signalée à l'organisateur (et envoyée par e-mail, RG-NTF-02).
 */
export async function syncMollieChargebacks(input: {
  organizationId: string;
  mollieOrganizationId: string;
  orderId: string;
  molliePaymentId: string;
  api: MollieApi;
}): Promise<void> {
  const list = await input.api<MollieList<"chargebacks", MollieChargeback>>(
    `/payments/${input.molliePaymentId}/chargebacks`,
  );
  for (const c of list._embedded.chargebacks) {
    const amountMinor = Math.abs(fromMollieAmount(c.amount));
    const data = {
      orderId: input.orderId,
      accountId: input.mollieOrganizationId,
      amountMinor,
      currency: c.amount.currency,
      reason: (c.reason?.description ?? "chargeback").slice(0, 200),
      status: c.reversedAt ? ("WON" as const) : ("NEEDS_RESPONSE" as const),
      evidenceDueBy: null,
    };
    const existed = await db.dispute.findUnique({
      where: { mollieChargebackId: c.id },
      select: { id: true },
    });
    await db.dispute.upsert({
      where: { mollieChargebackId: c.id },
      create: { mollieChargebackId: c.id, ...data },
      update: data,
    });
    if (!existed && !c.reversedAt)
      await notify(input.organizationId, "DISPUTE_OPENED", {
        title: "Litige ouvert",
        body: `Un acheteur conteste un paiement de ${formatMoney(amountMinor, c.amount.currency, "fr")}. Répondez dans Mollie.`,
        link: "/finances",
      });
  }
}

/**
 * Tâche horaire : un versement échoué vers la banque de l'organisateur lui est signalé une seule fois (PAYOUT_FAILED,
 * envoyé aussi par e-mail). Une erreur sur un compte n'arrête pas les suivants.
 */
export async function notifyFailedSettlements(): Promise<number> {
  const accounts = await db.mollieAccount.findMany({
    where: { disconnectedAt: null, canReceiveSettlements: true },
    select: {
      id: true,
      organizationId: true,
      failedSettlementNotifiedId: true,
    },
  });
  let notified = 0;
  for (const a of accounts) {
    try {
      const mollie = await mollieForOrganization(a.organizationId);
      if (!mollie) continue;
      const list = await mollie.plain<
        MollieList<"settlements", MollieSettlement>
      >("/settlements", { query: { limit: 5 } });
      const failed = list._embedded.settlements.find(
        (s) => s.status === "failed",
      );
      if (!failed || failed.id === a.failedSettlementNotifiedId) continue;
      await notify(a.organizationId, "PAYOUT_FAILED", {
        title: "Virement échoué",
        body: `Mollie n'a pas pu verser ${formatMoney(Math.abs(fromMollieAmount(failed.amount)), failed.amount.currency, "fr")} sur votre compte bancaire. Vérifiez votre compte bancaire dans Mollie.`,
        link: "/finances",
      });
      await db.mollieAccount.update({
        where: { id: a.id },
        data: { failedSettlementNotifiedId: failed.id },
      });
      notified++;
    } catch (err) {
      console.error("versements Mollie", safeError(err));
    }
  }
  return notified;
}
