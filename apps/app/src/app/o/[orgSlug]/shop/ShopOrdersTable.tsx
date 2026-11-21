"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";

export interface ShopOrderItem {
  id: string;
  reference: string;
  buyer: string;
  email: string;
  items: number;
  /** « 37,90 € » */
  total: string;
  totalMinor: number;
  status: string;
  fulfillmentStatus: string;
  withdrawal: boolean;
  /** « 17 nov. 2026, 14:05 » */
  date: string;
  dateAt: number;
  href: string;
}

const FULFILLMENT_TONE: Record<
  string,
  "warning" | "info" | "success" | "neutral"
> = {
  TO_PREPARE: "warning",
  READY: "info",
  PICKED_UP: "success",
  SHIPPED: "success",
};

/** État de préparation d'une commande (tableau et fiche). */
export function FulfillmentBadge({ status }: { status: string }) {
  const t = useTranslations("shopOrders");
  return (
    <Badge tone={FULFILLMENT_TONE[status] ?? "neutral"} dot>
      {t(`fulfillment_${status}`)}
    </Badge>
  );
}

/** État du paiement, seulement s'il n'est pas simplement payé (remboursements). */
export function PaymentBadge({ status }: { status: string }) {
  const t = useTranslations("shopOrders");
  if (status === "PAID") return null;
  return (
    <Badge tone={status === "REFUNDED" ? "neutral" : "warning"}>
      {t(`payment_${status}`)}
    </Badge>
  );
}

/**
 * Boutique, onglet Commandes (US-SHOP-06) : référence, acheteur, articles, total, état de préparation, rétractation
 * demandée ; une ligne mène à la fiche. Recherche par référence, nom ou adresse.
 */
export function ShopOrdersTable({ rows }: { rows: ShopOrderItem[] }) {
  const t = useTranslations("shopOrders");
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const shown = q
    ? rows.filter((r) =>
        [r.reference, r.buyer, r.email].some((x) =>
          x.toLocaleLowerCase().includes(q),
        ),
      )
    : rows;
  const columns: TableColumn<ShopOrderItem>[] = [
    {
      key: "buyer",
      header: t("buyer"),
      sortable: true,
      mobile: "title",
      cell: (o) => (
        <span className="grid min-w-0">
          <b className="truncate font-semibold">{o.buyer || o.email}</b>
          <small className="truncate text-[12.5px] text-ink-muted">
            {o.reference}
          </small>
        </span>
      ),
    },
    {
      key: "items",
      header: t("items"),
      align: "right",
      sortable: true,
      mobile: "meta",
      className: "tabular-nums",
      cell: (o) => t("itemsCount", { count: o.items }),
    },
    {
      key: "total",
      header: t("total"),
      align: "right",
      sortable: true,
      sortValue: (o) => o.totalMinor,
      mobile: "subtitle",
      className: "tabular-nums whitespace-nowrap",
    },
    {
      key: "fulfillmentStatus",
      header: t("state"),
      sortable: true,
      mobile: "badge",
      cell: (o) => (
        <span className="inline-flex flex-wrap gap-1.5">
          <FulfillmentBadge status={o.fulfillmentStatus} />
          <PaymentBadge status={o.status} />
          {o.withdrawal ? (
            <Badge tone="danger">{t("withdrawalBadge")}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "date",
      header: t("date"),
      sortable: true,
      sortValue: (o) => o.dateAt,
      cell: (o) => (
        <small className="text-[12.5px] whitespace-nowrap text-ink-muted">
          {o.date}
        </small>
      ),
    },
  ];
  return (
    <DataTable
      rows={shown}
      columns={columns}
      getRowId={(o) => o.id}
      rowHref={(o) => o.href}
      caption={t("caption")}
      defaultSort={{ key: "date", dir: "desc" }}
      search={{ value: query, onChange: setQuery, placeholder: t("search") }}
      emptyState={
        q
          ? { title: t("noMatch") }
          : { title: t("emptyTitle"), description: t("emptyBody") }
      }
    />
  );
}
