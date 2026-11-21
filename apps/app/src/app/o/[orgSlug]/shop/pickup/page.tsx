import { can, hasFeature } from "@evoly/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { PickupScanner } from "./PickupScanner";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("shopOrders"))("scanPickup") };
}

/** Retrait des commandes de la boutique au code QR (droit de gérer les commandes ou de scanner). */
export default async function PickupPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (
    !hasFeature(ctx.features, "SHOP") ||
    (!can(ctx.membership, "ORDERS_MANAGE") &&
      !can(ctx.membership, "CHECKIN_SCAN"))
  )
    notFound();
  return <PickupScanner orgSlug={ctx.organization.slug} />;
}
