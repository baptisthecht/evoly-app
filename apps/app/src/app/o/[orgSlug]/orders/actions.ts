"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, runOrgAction, type ActionState } from "@/server/guard";
import {
  correctBuyerEmail,
  resendTickets,
  updateHolderByOrganizer,
} from "@/server/ordersAdmin";
import {
  approveRefund,
  refundOptions,
  refundTickets,
  rejectRefund,
  retryRefund,
} from "@/server/refunds";
import { revertCheckIn } from "@/server/scanner";
import { blockBuyer, unblockBuyer } from "@/server/blockedBuyers";

const path = (orgSlug: string, orderId: string) =>
  `/o/${orgSlug}/orders/${orderId}`;
const optionalMessage = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().trim().max(500).nullable(),
);

export async function resendTicketsAction(
  orgSlug: string,
  orderId: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "ORDERS_MANAGE" },
    async (_d, ctx) => {
      await resendTickets(ctx, orderId);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

/** Barre de sélection des commandes (refonte A3) : les billets renvoyés pour chaque commande choisie. */
export async function resendManyAction(
  orgSlug: string,
  orderIds: string[],
): Promise<ActionState<number>> {
  const ids = [...new Set(orderIds)].slice(0, 200);
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "ORDERS_MANAGE" },
    async (_d, ctx) => {
      for (const id of ids) await resendTickets(ctx, id);
      return ids.length;
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/orders`);
  return r as ActionState<number>;
}

export async function correctEmailAction(
  orgSlug: string,
  orderId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    {
      schema: z.object({
        email: z.email({ message: "validation.email" }).max(200),
      }),
      permission: "ORDERS_MANAGE",
    },
    async (d, ctx) => {
      await correctBuyerEmail(ctx, orderId, d.email);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

export async function holderAction(
  orgSlug: string,
  orderId: string,
  ticketId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const schema = z.object({
    firstName: z
      .string()
      .trim()
      .min(1, { message: "validation.required" })
      .max(60),
    lastName: z
      .string()
      .trim()
      .min(1, { message: "validation.required" })
      .max(60),
  });
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    { schema, permission: "ORDERS_MANAGE" },
    async (d, ctx) => {
      await updateHolderByOrganizer(ctx, orderId, ticketId, d);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

/** US-REF-03 : remboursement de billets choisis, à tout moment. */
export async function refundTicketsAction(
  orgSlug: string,
  orderId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState<{ outcome: string }>> {
  const data = {
    ...formToObject(form),
    ticketIds: form.getAll("ticketIds").map(String),
  };
  const schema = z.object({
    ticketIds: z
      .array(z.string().max(40))
      .min(1, { message: "validation.required" })
      .max(100),
    reason: z.enum(["OTHER", "DUPLICATE", "FRAUD", "BUYER_REQUEST"]),
    message: optionalMessage,
  });
  const r = await runOrgAction(
    orgSlug,
    data,
    { schema, permission: "REFUNDS_MANAGE" },
    async (d, ctx) => ({
      outcome: await refundTickets(
        ctx,
        orderId,
        d.ticketIds,
        d.reason,
        d.message,
      ),
    }),
  );
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

export async function decideRefundAction(
  orgSlug: string,
  orderId: string,
  refundId: string,
  decision: "approve" | "reject" | "retry",
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    {
      schema: z.object({ message: optionalMessage }),
      permission: "REFUNDS_MANAGE",
    },
    async (d, ctx) => {
      if (decision === "approve") await approveRefund(ctx, refundId, d.message);
      if (decision === "reject") await rejectRefund(ctx, refundId, d.message);
      if (decision === "retry") await retryRefund(ctx, refundId);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

/** RG-SCN-02 : annulation d'une entrée scannée par erreur, avec motif. */
export async function revertCheckInAction(
  orgSlug: string,
  orderId: string,
  ticketId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    {
      schema: z.object({
        note: z
          .string()
          .trim()
          .min(3, { message: "validation.textLength" })
          .max(300),
      }),
      permission: "CHECKIN_MANAGE",
    },
    async (d, ctx) => {
      await revertCheckIn(ctx, ticketId, d.note);
      return null;
    },
  );
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

/** RG-OPT-07 : rembourser des options non retirées (quantité par option). */
export async function refundOptionsAction(
  orgSlug: string,
  orderId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState<{ outcome: string }>> {
  const lines = [...form.entries()]
    .filter(([k]) => k.startsWith("q_"))
    .map(([k, v]) => ({ orderOptionId: k.slice(2), quantity: Number(v) || 0 }))
    .filter((l) => l.quantity > 0);
  const schema = z.object({
    lines: z
      .array(
        z.object({
          orderOptionId: z.string().max(40),
          quantity: z.number().int().min(1).max(1000),
        }),
      )
      .min(1, { message: "validation.required" })
      .max(50),
  });
  const r = await runOrgAction(
    orgSlug,
    { lines },
    { schema, permission: "REFUNDS_MANAGE" },
    async (d, ctx) => ({
      outcome: await refundOptions(ctx, orderId, d.lines, null),
    }),
  );
  if (r?.ok) revalidatePath(path(orgSlug, orderId));
  return r;
}

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

/**
 * Bloquer une personne (onglet « Personnes bloquées », ou « Bloquer cet acheteur » depuis une commande) : une adresse,
 * ou un prénom et un nom ; les cartes des commandes de cette adresse dans l'organisation sont reprises.
 */
export async function blockBuyerAction(
  orgSlug: string,
  orderId: string | null,
  _: ActionState<{ cards: number }>,
  form: FormData,
): Promise<ActionState<{ cards: number }>> {
  const r = await runOrgAction(
    orgSlug,
    formToObject(form),
    {
      schema: z.object({
        email: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z
            .email({ message: "validation.email" })
            .max(200)
            .nullable()
            .optional(),
        ),
        firstName: optionalText(60),
        lastName: optionalText(60),
        reason: optionalText(500),
      }),
      permission: "ORDERS_MANAGE",
    },
    async (d, ctx) => {
      const { cards } = await blockBuyer(ctx, { ...d, orderId });
      return { cards };
    },
  );
  if (r?.ok) {
    revalidatePath(`/o/${orgSlug}/orders`);
    if (orderId) revalidatePath(path(orgSlug, orderId));
  }
  return r as ActionState<{ cards: number }>;
}

/** Débloquer une personne, à tout moment. */
export async function unblockBuyerAction(
  orgSlug: string,
  blockedBuyerId: string,
  _: ActionState,
): Promise<ActionState> {
  const r = await runOrgAction(
    orgSlug,
    {},
    { schema: z.object({}), permission: "ORDERS_MANAGE" },
    async (_d, ctx) => {
      await unblockBuyer(ctx, blockedBuyerId);
      return null;
    },
  );
  if (r?.ok) revalidatePath(`/o/${orgSlug}/orders`);
  return r;
}
