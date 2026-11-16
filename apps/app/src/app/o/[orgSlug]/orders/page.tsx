import { can } from "@evoly/core";
import { formatDate, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { listBlockedBuyers } from "@/server/blockedBuyers";
import { requireOrgContext } from "@/server/context";
import { BlockedBuyersTable } from "./BlockedBuyers";
import { OrdersView, type OrdersSearch } from "./OrdersView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

/**
 * US-ORD-01 : les commandes de l'organisation (refonte A3, maquette UIUX/pages-a3.html, « Commandes ») ; onglet
 * « Personnes bloquées » (?tab=blocked).
 */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<OrdersSearch & { tab?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  if (sp.tab === "blocked") return <BlockedBuyers orgSlug={orgSlug} />;
  return <OrdersView orgSlug={orgSlug} sp={sp} />;
}

/**
 * Onglet « Personnes bloquées » (droit de gérer les commandes) : qui ne peut plus commander chez l'organisation, par
 * son adresse ou sa carte ; un nom identique ne fait que signaler la commande. Liste propre à l'organisation.
 */
async function BlockedBuyers({ orgSlug }: { orgSlug: string }) {
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "ORDERS_MANAGE")) notFound();
  const [rows, t, locale] = await Promise.all([
    listBlockedBuyers(ctx),
    getTranslations("ordersAdmin"),
    getLocale(),
  ]);
  const tz = ctx.organization.timezone;
  return (
    <div className="grid gap-3.5">
      <p className="max-w-[68ch] text-[13.5px] text-ink-muted">
        {t("blockedIntro")}
      </p>
      <BlockedBuyersTable
        orgSlug={ctx.organization.slug}
        canManage={!ctx.readOnly}
        rows={rows.map((b) => ({
          id: b.id,
          name: b.name,
          email: b.email,
          hasCard: b.hasCard,
          reason: b.reason,
          addedBy: b.addedBy,
          date: formatDate(b.createdAt, tz, locale as Locale),
          dateAt: b.createdAt.getTime(),
        }))}
      />
    </div>
  );
}
