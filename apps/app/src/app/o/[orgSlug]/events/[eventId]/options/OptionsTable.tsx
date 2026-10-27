"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { type Initial, OptionCommand, OptionForm } from "./OptionForm";
import { OptionsRefundPolicy } from "./OptionsRefundPolicy";

export interface OptionRow {
  id: string;
  name: string;
  description: string;
  price: string;
  priceMinor: number;
  sold: number;
  stock: number | null;
  redeemed: number;
  maxPerOrder: number;
  active: boolean;
  initial: Initial;
}

/** Billetterie, options : le tableau, « Ajouter » et « Réglages » dans des fenêtres, la modification aussi. */
export function OptionsTable({
  rows,
  manage,
  orgSlug,
  eventId,
  symbol,
  refundAfterStart,
}: {
  rows: OptionRow[];
  manage: boolean;
  orgSlug: string;
  eventId: string;
  symbol: string;
  refundAfterStart: boolean;
}) {
  const t = useTranslations("options");
  const [dialog, setDialog] = useState<"new" | "settings" | string | null>(
    null,
  );
  const editing =
    dialog && dialog !== "new" && dialog !== "settings"
      ? rows.find((r) => r.id === dialog)
      : null;
  const columns: TableColumn<OptionRow>[] = [
    {
      key: "name",
      header: t("tableOption"),
      sortable: true,
      mobile: "title",
      cell: (o) => (
        <span className="grid min-w-0">
          <span className="font-semibold">{o.name}</span>
          {o.description ? (
            <span className="truncate text-sm text-ink-muted">
              {o.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "price",
      header: t("tablePrice"),
      sortable: true,
      align: "right",
      width: "7rem",
      sortValue: (o) => o.priceMinor,
    },
    {
      key: "sold",
      header: t("tableSold"),
      sortable: true,
      align: "right",
      width: "9rem",
      cell: (o) => (
        <span className="inline-grid justify-items-end gap-1">
          <span className="tabular-nums">
            {o.stock != null ? `${o.sold} / ${o.stock}` : o.sold}
          </span>
          {o.stock ? (
            <span
              aria-hidden="true"
              className="block h-1 w-16 overflow-hidden rounded-full bg-surface-sunken"
            >
              <span
                className="block h-1 rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.min(100, (o.sold / o.stock) * 100)}%` }}
              />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "redeemed",
      header: t("tableRedeemed"),
      sortable: true,
      align: "right",
      width: "7rem",
    },
    {
      key: "maxPerOrder",
      header: t("tablePerOrder"),
      align: "right",
      width: "7rem",
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      sortValue: (o) => (o.active ? 0 : 1),
      cell: (o) => (
        <Badge tone={o.active ? "success" : "neutral"} dot>
          {o.active ? t("active") : t("inactive")}
        </Badge>
      ),
    },
  ];
  if (manage)
    columns.push({
      key: "actions",
      header: <span className="sr-only">{t("tableActions")}</span>,
      align: "right",
      cell: (o) => (
        <span className="inline-flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDialog(o.id)}
          >
            {t("edit")}
          </Button>
          <OptionCommand
            orgSlug={orgSlug}
            eventId={eventId}
            optionId={o.id}
            command={o.active ? "deactivate" : "activate"}
            label={o.active ? t("deactivate") : t("activate")}
          />
        </span>
      ),
    });
  return (
    <div className="grid gap-4">
      {manage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="dark"
            size="md"
            onClick={() => setDialog("new")}
          >
            + {t("newTitle")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setDialog("settings")}
          >
            {t("settings")}
          </Button>
        </div>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(o) => o.id}
        caption={t("tableCaption")}
        emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
      />
      <Dialog
        open={dialog === "new"}
        onClose={() => setDialog(null)}
        title={t("newTitle")}
        size="lg"
      >
        <OptionForm orgSlug={orgSlug} eventId={eventId} symbol={symbol} bare />
      </Dialog>
      <Dialog
        open={dialog === "settings"}
        onClose={() => setDialog(null)}
        title={t("settings")}
      >
        <OptionsRefundPolicy
          orgSlug={orgSlug}
          eventId={eventId}
          allowed={refundAfterStart}
        />
      </Dialog>
      <Dialog
        open={!!editing}
        onClose={() => setDialog(null)}
        title={editing ? editing.name : t("edit")}
        size="lg"
      >
        {editing ? (
          <OptionForm
            orgSlug={orgSlug}
            eventId={eventId}
            symbol={symbol}
            option={editing.initial}
            bare
          />
        ) : null}
      </Dialog>
    </div>
  );
}
