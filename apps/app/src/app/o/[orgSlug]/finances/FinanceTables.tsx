"use client";

import { useTranslations } from "next-intl";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";

export interface FinanceEventRow {
  id: string;
  title: string;
  tickets: number;
  gross: string;
  grossMinor: number;
  refunded: string | null;
  refundedMinor: number;
  commission: string | null;
  commissionMinor: number;
  bankFees: string | null;
  bankFeeMinor: number;
  net: string;
  netMinor: number;
  href: string;
}

const Minus = ({ value }: { value: string | null }) =>
  value ? (
    <span className="text-danger/80">−{value}</span>
  ) : (
    <span className="text-ink-subtle">·</span>
  );

/** Finances : recettes par événement (billets, brut, remboursements, commission, frais bancaires, net). */
export function FinanceByEventTable({ rows }: { rows: FinanceEventRow[] }) {
  const t = useTranslations("finances");
  const columns: TableColumn<FinanceEventRow>[] = [
    { key: "title", header: t("colEvent"), sortable: true, mobile: "title" },
    {
      key: "tickets",
      header: t("colTickets"),
      sortable: true,
      align: "right",
      width: "6rem",
    },
    {
      key: "gross",
      header: t("colGross"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.grossMinor,
    },
    {
      key: "refunded",
      header: t("colRefunded"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.refundedMinor,
      cell: (r) => <Minus value={r.refunded} />,
    },
    {
      key: "commission",
      header: t("colCommission"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.commissionMinor,
      cell: (r) => <Minus value={r.commission} />,
    },
    {
      key: "bankFees",
      header: t("colBankFees"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.bankFeeMinor,
      cell: (r) => <Minus value={r.bankFees} />,
    },
    {
      key: "net",
      header: t("colNet"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.netMinor,
      cell: (r) => <span className="font-semibold text-success">{r.net}</span>,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      rowHref={(r) => r.href}
      caption={t("byEventCaption")}
      defaultSort={{ key: "net", dir: "desc" }}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
    />
  );
}
