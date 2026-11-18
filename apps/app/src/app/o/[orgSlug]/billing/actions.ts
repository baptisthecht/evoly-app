"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changeInterval, openPortal, startCheckout } from "@/server/billing";
import {
  cancelProSubscription,
  proBillingProvider,
  resumeProSubscription,
  startPaymentMethodChange,
  startProCheckout,
  startProTrial,
} from "@/server/proBilling";
import { runOrgAction, type ActionState } from "@/server/guard";

/**
 * Section 9.21 : passer en Pro, mensuel ou annuel. Avec Mollie (docs/MOLLIE.md, lot 6) : essai de 14 jours sans carte
 * (bouton « trial »), ou paiement sur la page de Mollie, qui crée le mandat des renouvellements (ou règle une période
 * impayée). Avant Mollie : Stripe Checkout, essai compris.
 */
export async function checkoutAction(
  orgSlug: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const trial = form.get("mode") === "trial";
  const r = await runOrgAction(
    orgSlug,
    { interval: form.get("interval") ?? "YEAR" },
    {
      schema: z.object({ interval: z.enum(["MONTH", "YEAR"]) }),
      permission: "BILLING_MANAGE",
      write: false,
    },
    async (d, ctx) => {
      if (proBillingProvider() === "STRIPE")
        return startCheckout(ctx, d.interval);
      if (!trial) return startProCheckout(ctx, d.interval);
      await startProTrial(ctx, d.interval);
      return `/o/${orgSlug}/billing?essai=ok`;
    },
  );
  if (r?.ok) redirect(r.data);
  return r;
}

/** Portail client Stripe (ancien abonnement) : périodicité, moyen de paiement, factures, résiliation. */
export async function portalAction(
  orgSlug: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "BILLING_MANAGE", write: false },
    (_d, ctx) => openPortal(ctx),
  );
  if (r?.ok) redirect(r.data);
  return r;
}

/** Changer de moyen de paiement (Mollie) : carte enregistrée sur la page de Mollie, sans paiement. */
export async function paymentMethodAction(
  orgSlug: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "BILLING_MANAGE", write: false },
    (_d, ctx) => startPaymentMethodChange(ctx),
  );
  if (r?.ok) redirect(r.data);
  return r;
}

/** Résilier (Mollie) : plus de prélèvement, Pro jusqu'à la fin de la période payée. */
export async function cancelAction(
  orgSlug: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "BILLING_MANAGE", write: false },
    async (_d, ctx) => {
      await cancelProSubscription(ctx);
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/billing`);
  return r;
}

/** Reprendre un abonnement résilié (Mollie) avant la fin de sa période, sans payer. */
export async function resumeAction(
  orgSlug: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "BILLING_MANAGE", write: false },
    async (_d, ctx) => {
      await resumeProSubscription(ctx);
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/billing`);
  return r;
}

/**
 * RG-SUB-05 : passage du mensuel à l'annuel ou l'inverse. Mollie : au prochain renouvellement, sans prorata ; ancien
 * abonnement Stripe : tout de suite, prorata calculé par Stripe.
 */
export async function switchIntervalAction(
  orgSlug: string,
  interval: "MONTH" | "YEAR",
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    { interval },
    {
      schema: z.object({ interval: z.enum(["MONTH", "YEAR"]) }),
      permission: "BILLING_MANAGE",
    },
    async (d, ctx) => {
      await changeInterval(ctx, d.interval);
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/billing`);
  return r;
}
