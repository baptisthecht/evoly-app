import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrdersView, type OrdersSearch } from "./OrdersView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

/** US-ORD-01 : les commandes de l'organisation (refonte A3, maquette UIUX/pages-a3.html, « Commandes »). */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<OrdersSearch>;
}) {
  const { orgSlug } = await params;
  return <OrdersView orgSlug={orgSlug} sp={await searchParams} />;
}
