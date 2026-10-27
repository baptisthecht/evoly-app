"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { CancelListing } from "./CancelListing";

export interface EventResaleRow {
  id: string;
  code: string;
  type: string;
  seller: string;
  price: string | null;
  priceMinor: number;
  face: string;
  status: string;
  statusLabel: string;
  tone: BadgeTone;
  listed: string;
  listedAt: number;
  sold: string | null;
  refund: string | null;
  cancellable: boolean;
}

/** Participants, revente : les annonces de l'événement (billet, vendeur, prix, statut, dates, annulation). */
export function EventResaleTable({
  rows,
  orgSlug,
  eventId,
}: {
  rows: EventResaleRow[];
  orgSlug: string;
  eventId: string;
}) {
  const t = useTranslations("resaleAdmin");
  const columns: TableColumn<EventResaleRow>[] = [
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
      key: "seller",
      header: t("tableSeller"),
      sortable: true,
      mobile: "subtitle",
      cell: (r) => <span className="truncate">{r.seller}</span>,
    },
    {
      key: "price",
      header: t("tablePrice"),
      sortable: true,
      align: "right",
      width: "9rem",
      sortValue: (r) => r.priceMinor,
      cell: (r) => (
        <span className="inline-grid justify-items-end">
          {r.price ? (
            <span className="font-semibold">{r.price}</span>
          ) : (
            <Badge tone="lilas">{t("transfer")}</Badge>
          )}
          <span className="text-xs text-ink-muted">
            {t("faceValue", { value: r.face })}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      sortValue: (r) => r.statusLabel,
      cell: (r) => (
        <span className="grid justify-items-start gap-1">
          <Badge tone={r.tone} dot live={r.status === "ACTIVE"}>
            {r.statusLabel}
          </Badge>
          {r.status === "FAILED" ? (
            <span className="text-xs text-danger">{t("failedHint")}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "listed",
      header: t("tableListed"),
      sortable: true,
      sortValue: (r) => r.listedAt,
      cell: (r) => (
        <span className="grid text-sm">
          <span>{r.listed}</span>
          {r.sold ? (
            <span className="text-ink-muted">
              {t("soldOn", { date: r.sold })}
            </span>
          ) : null}
          {r.refund ? (
            <span className="text-ink-muted">
              {t("refunded", { amount: r.refund })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("tableActions")}</span>,
      align: "right",
      cell: (r) =>
        r.cancellable ? (
          <CancelListing orgSlug={orgSlug} eventId={eventId} listingId={r.id} />
        ) : null,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      caption={t("tableCaptionEvent")}
      defaultSort={{ key: "listed", dir: "desc" }}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
    />
  );
}
