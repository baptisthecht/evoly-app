"use server";

import { CoreError } from "@evoly/core";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { safeError } from "@/lib/redact";
import { getPublicOrganization } from "@/server/publicEvents";
import { hit } from "@/server/rateLimit";
import { clientIp } from "@/server/requestInfo";
import {
  cancelShopReservation,
  cartPreview,
  confirmShopPayment,
  reserveShopOrder,
  submitShopBuyer,
  type CartPreviewLine,
} from "@/server/shopCheckout";
import { requestShopWithdrawal } from "@/server/shopOrders";

// Boutique publique (lot 3b), section 9.35 : panier, réservation, coordonnées, paiement, rétractation

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof CoreError) return { ok: false, error: err.code };
  console.error("boutique", safeError(err));
  return { ok: false, error: "UNKNOWN" };
}

const linesSchema = z
  .array(
    z.object({
      variantId: z.string().min(10).max(40),
      quantity: z.number().int().min(1).max(20),
    }),
  )
  .max(30);

/** Panier du navigateur relu : prix, disponibilité et modes de remise actuels. */
export async function cartPreviewAction(
  sub: string,
  lines: unknown,
): Promise<Result<CartPreviewLine[]>> {
  const parsed = linesSchema.safeParse(lines);
  if (!parsed.success) return { ok: true, data: [] };
  const org = await getPublicOrganization(sub.slice(0, 80));
  if (!org) return { ok: false, error: "NOT_FOUND" };
  try {
    return { ok: true, data: await cartPreview(org.id, parsed.data) };
  } catch (err) {
    return failure(err);
  }
}

/** « Commander » : les produits du panier retenus pendant le paiement (RG-SHOP-07), limité par adresse IP. */
export async function reserveCartAction(
  sub: string,
  lines: unknown,
): Promise<Result<{ token: string }>> {
  const parsed = linesSchema.safeParse(lines);
  if (!parsed.success || parsed.data.length === 0)
    return { ok: false, error: "SHOP_CART_EMPTY" };
  if ((await hit(`shop:reserve:${await clientIp()}`, 600)) > 30)
    return { ok: false, error: "RATE_LIMITED" };
  const org = await getPublicOrganization(sub.slice(0, 80));
  if (!org) return { ok: false, error: "NOT_FOUND" };
  try {
    const r = await reserveShopOrder({
      organizationId: org.id,
      lines: parsed.data,
      locale: await getLocale(),
    });
    return { ok: true, data: { token: r.token } };
  } catch (err) {
    return failure(err);
  }
}

const buyerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.email().max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  marketingOptIn: z.boolean(),
  pickupPointId: z.string().min(1).max(40),
});

/** Coordonnées et lieu de retrait : l'intention de paiement est créée sur le compte de l'organisation. */
export async function submitShopBuyerAction(
  token: string,
  buyer: unknown,
): Promise<
  Result<{ clientSecret: string; stripeAccountId: string } | { paid: true }>
> {
  const parsed = buyerSchema.safeParse(buyer);
  if (!parsed.success) return { ok: false, error: "INVALID_BUYER" };
  if ((await hit(`shop:submit:${token.slice(0, 16)}`, 600)) > 15)
    return { ok: false, error: "RATE_LIMITED" };
  try {
    return { ok: true, data: await submitShopBuyer(token, parsed.data) };
  } catch (err) {
    return failure(err);
  }
}

/** Paiement confirmé par le serveur ; retour de la banque construit ici (jamais reçu tel quel du navigateur). */
export async function confirmShopPaymentAction(
  token: string,
  confirmationTokenId: string,
  path: string,
): Promise<
  Result<{ kind: "DONE" } | { kind: "ACTION"; clientSecret: string }>
> {
  if ((await hit(`shop:confirm:${token.slice(0, 16)}`, 600)) > 15)
    return { ok: false, error: "RATE_LIMITED" };
  if (!/^\/boutique\/commande\/[A-Za-z0-9_-]{43}$/.test(path))
    return { ok: false, error: "PAYMENT_INVALID" };
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]!
    .trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host))
    return { ok: false, error: "PAYMENT_INVALID" };
  const proto = h.get("x-forwarded-proto") === "http" ? "http" : "https";
  try {
    return {
      ok: true,
      data: await confirmShopPayment(
        token,
        confirmationTokenId,
        `${proto}://${host}${path}`,
      ),
    };
  } catch (err) {
    return failure(err);
  }
}

/** Abandon du paiement : les produits retenus sont rendus tout de suite. */
export async function cancelShopReservationAction(
  token: string,
): Promise<void> {
  await cancelShopReservation(token).catch(() => undefined);
}

/** RG-SHOP-11 : rétractation depuis la page de la commande. */
export async function withdrawShopOrderAction(
  token: string,
): Promise<Result<null>> {
  if ((await hit(`shop:withdraw:${token.slice(0, 16)}`, 3600)) > 5)
    return { ok: false, error: "RATE_LIMITED" };
  try {
    await requestShopWithdrawal(token);
    return { ok: true, data: null };
  } catch (err) {
    return failure(err);
  }
}
