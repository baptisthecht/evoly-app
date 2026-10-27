"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";

export interface ResaleRow {
  id: string;
  code: string;
  type: string;
  event: string;
  price: string | null;
  priceMinor: number;
  status: string;
  statusLabel: string;
  tone: BadgeTone;
  listed: string;
  listedAt: number;
  href: string;
}

/** Revente : les dernières annonces et reventes de l'organisation (billet, événement, prix, statut, date). */
export function ResaleTable({ rows }: { rows: ResaleRow[] }) {
  const t = useTranslations("resaleAdmin");
  const columns: TableColumn<ResaleRow>[] = [
    {
      key: "code",
      header: t("tableTicket"),
      sortable: true,
      mobile: "title",
      cell: (r) => (
        <span className="grid min-w-0">
          <span className="font-mono font-semibold tracking-wide">
            {r.code}
          </span>
          <span className="truncate text-sm text-ink-muted">{r.type}</span>
        </span>
      ),
    },
    {
      key: "event",
      header: t("tableEvent"),
      sortable: true,
      mobile: "subtitle",
      cell: (r) => <span className="line-clamp-2">{r.event}</span>,
    },
    {
      key: "price",
      header: t("tablePrice"),
      sortable: true,
      align: "right",
      width: "8rem",
      sortValue: (r) => r.priceMinor,
      cell: (r) =>
        r.price ? (
          <span className="font-semibold">{r.price}</span>
        ) : (
          <Badge tone="lilas">{t("transfer")}</Badge>
        ),
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      sortValue: (r) => r.statusLabel,
      cell: (r) => (
        <Badge tone={r.tone} dot live={r.status === "ACTIVE"}>
          {r.statusLabel}
        </Badge>
      ),
    },
    {
      key: "listed",
      header: t("tableListed"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.listedAt,
      cell: (r) => <span className="text-ink-muted">{r.listed}</span>,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      rowHref={(r) => r.href}
      caption={t("recent")}
      defaultSort={{ key: "listed", dir: "desc" }}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
    />
  );
}
