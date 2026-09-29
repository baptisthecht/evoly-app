"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";
import { correctBuyerEmail, resendTickets, updateHolderByOrganizer } from "@/server/ordersAdmin";
import { approveRefund, refundTickets, rejectRefund, retryRefund } from "@/server/refunds";
import { revertCheckIn } from "@/server/scanner";

const path = (orgSlug: string, orderId: string) => `/o/${orgSlug}/orders/${orderId}`;
const optionalMessage = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(500).nullable());

export async function resendTicketsAction(orgSlug: string, orderId: string, _: ActionState): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, {}, { schema: z.object({}), permission: "ORDERS_MANAGE" }, async (_d, ctx) => {
    await resendTickets(ctx, orderId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

export async function correctEmailAction(orgSlug: string, orderId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema: z.object({ email: z.email({ message: "validation.email" }).max(200) }), permission: "ORDERS_MANAGE" }, async (d, ctx) => {
    await correctBuyerEmail(ctx, orderId, d.email);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

export async function holderAction(orgSlug: string, orderId: string, ticketId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const schema = z.object({ firstName: z.string().trim().min(1, { message: "validation.required" }).max(60), lastName: z.string().trim().min(1, { message: "validation.required" }).max(60) });
  const r = await runOrgAction(orgSlug, formToObject(form), { schema, permission: "ORDERS_MANAGE" }, async (d, ctx) => {
    await updateHolderByOrganizer(ctx, orderId, ticketId, d);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

/** US-REF-03 : remboursement de billets choisis, à tout moment. */
export async function refundTicketsAction(orgSlug: string, orderId: string, _: ActionState, form: FormData): Promise<ActionState<{ outcome: string }>> {
  const data = { ...formToObject(form), ticketIds: form.getAll("ticketIds").map(String) };
  const schema = z.object({ ticketIds: z.array(z.string().max(40)).min(1, { message: "validation.required" }).max(100), reason: z.enum(["OTHER", "DUPLICATE", "FRAUD", "BUYER_REQUEST"]), message: optionalMessage });
  const r = await runOrgAction(orgSlug, data, { schema, permission: "REFUNDS_MANAGE" }, async (d, ctx) => ({ outcome: await refundTickets(ctx, orderId, d.ticketIds, d.reason, d.message) }));
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

export async function decideRefundAction(orgSlug: string, orderId: string, refundId: string, decision: "approve" | "reject" | "retry", _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema: z.object({ message: optionalMessage }), permission: "REFUNDS_MANAGE" }, async (d, ctx) => {
    if (decision === "approve") await approveRefund(ctx, refundId, d.message);
    if (decision === "reject") await rejectRefund(ctx, refundId, d.message);
    if (decision === "retry") await retryRefund(ctx, refundId);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

/** RG-SCN-02 : annulation d'une entrée scannée par erreur, avec motif. */
export async function revertCheckInAction(orgSlug: string, orderId: string, ticketId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await runOrgAction(orgSlug, formToObject(form), { schema: z.object({ note: z.string().trim().min(3, { message: "validation.textLength" }).max(300) }), permission: "CHECKIN_MANAGE" }, async (d, ctx) => {
    await revertCheckIn(ctx, ticketId, d.note);
    return null;
  });
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}
