"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";

export interface OrderRow {
  id: string;
  kind: "order" | "network";
  name: string;
  email: string;
  event: string;
  reference: string;
  channel: string;
  statusLabel: string;
  statusTone: BadgeTone;
  extra: { label: string; tone: BadgeTone }[];
  tickets: number;
  total: string;
  totalMinor: number;
  date: string;
  dateAt: number;
  href: string | null;
}

/**
 * Commandes : un seul tableau, commandes Evoly et billets des réseaux (pastille du canal), filtré
 * par le « Canal » de la recherche ; une commande Evoly ouvre sa fiche.
 */
export function OrdersTable({
  rows,
  footer,
  caption,
}: {
  rows: OrderRow[];
  footer?: ReactNode;
  caption: string;
}) {
  const t = useTranslations("orders");
  const columns: TableColumn<OrderRow>[] = [
    {
      key: "name",
      header: t("tableBuyer"),
      sortable: true,
      mobile: "title",
      cell: (o) => (
        <span className="grid min-w-0">
          <span className="truncate font-semibold">{o.name}</span>
          <span className="truncate text-sm text-ink-muted">
            {o.email || <span className="font-mono">{o.reference}</span>}
          </span>
        </span>
      ),
    },
    {
      key: "event",
      header: t("tableEvent"),
      sortable: true,
      mobile: "subtitle",
      cell: (o) => <span className="line-clamp-2">{o.event}</span>,
    },
    {
      key: "channel",
      header: t("tableChannel"),
      sortable: true,
      mobile: "badge",
      cell: (o) => (
        <Badge tone={o.kind === "order" ? "dark" : "lilas"}>{o.channel}</Badge>
      ),
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      sortValue: (o) => o.statusLabel,
      cell: (o) => (
        <span className="flex flex-wrap gap-1.5">
          <Badge tone={o.statusTone} dot>
            {o.statusLabel}
          </Badge>
          {o.extra.map((x) => (
            <Badge key={x.label} tone={x.tone}>
              {x.label}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "tickets",
      header: t("tableTickets"),
      sortable: true,
      align: "right",
      width: "6rem",
    },
    {
      key: "total",
      header: t("tableTotal"),
      sortable: true,
      align: "right",
      width: "8rem",
      sortValue: (o) => o.totalMinor,
      cell: (o) => <span className="font-semibold">{o.total}</span>,
    },
    {
      key: "date",
      header: t("tableDate"),
      sortable: true,
      align: "right",
      width: "10rem",
      sortValue: (o) => o.dateAt,
      cell: (o) => <span className="text-ink-muted">{o.date}</span>,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(o) => `${o.kind}-${o.id}`}
      rowHref={(o) => o.href}
      caption={caption}
      defaultSort={{ key: "date", dir: "desc" }}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
      footer={footer}
    />
  );
}
