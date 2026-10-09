"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { openPortal, startCheckout, switchInterval } from "@/server/billing";
import { runOrgAction, type ActionState } from "@/server/guard";

/** Section 9.21 : « Essayer Pro 14 jours » vers Stripe Checkout (carte requise, mensuel ou annuel). */
export async function checkoutAction(orgSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    { interval: form.get("interval") },
    { schema: z.object({ interval: z.enum(["MONTH", "YEAR"]) }), permission: "BILLING_MANAGE", write: false },
    (d, ctx) => startCheckout(ctx, d.interval),
  );
  if (r?.ok) redirect(r.data);
  return r;
}

/** Portail client Stripe : périodicité, moyen de paiement, factures, résiliation. */
export async function portalAction(orgSlug: string, _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "BILLING_MANAGE", write: false }, (_d, ctx) => openPortal(ctx));
  if (r?.ok) redirect(r.data);
  return r;
}

/** RG-SUB-05 : passage du mensuel à l'annuel ou l'inverse, prorata calculé par Stripe. */
export async function switchIntervalAction(orgSlug: string, interval: "MONTH" | "YEAR"): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    { interval },
    { schema: z.object({ interval: z.enum(["MONTH", "YEAR"]) }), permission: "BILLING_MANAGE" },
    async (d, ctx) => {
      await switchInterval(ctx, d.interval);
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/billing`);
  return r;
}
