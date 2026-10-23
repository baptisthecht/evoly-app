import { OrderHeader } from "@/components/orders/OrderHeader";

/** Une commande : sa bande d'en-tête (acheteur, statut, onglets), comme un événement. */
export default async function Header({
  params,
}: {
  params: Promise<{ orgSlug: string; orderId: string }>;
}) {
  const { orgSlug, orderId } = await params;
  return <OrderHeader orgSlug={orgSlug} orderId={orderId} />;
}
