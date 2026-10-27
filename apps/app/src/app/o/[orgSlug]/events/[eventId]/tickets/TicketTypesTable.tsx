"use client";

import type { FeeTerms } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import {
  TicketTypeCommand,
  TicketTypeEditPanel,
  type TicketTypeRow,
} from "./TicketTypeEditor";

const short = (local: string, locale: string) =>
  local
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(local))
    : "";

/**
 * Billetterie, tarifs : le tableau, dans l'ordre de la billetterie (pas de tri) ; prix et paliers,
 * ventes avec leur jauge, période de vente, statut ; l'édition complète (paliers compris) dans une fenêtre.
 */
export function TicketTypesTable({
  rows,
  orgSlug,
  eventId,
  terms,
  currency,
  tiersEnabled,
  tiersLocked,
  manage,
}: {
  rows: TicketTypeRow[];
  orgSlug: string;
  eventId: string;
  terms: FeeTerms;
  currency: string;
  tiersEnabled: boolean;
  tiersLocked: boolean;
  manage: boolean;
}) {
  const t = useTranslations("tickets");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState<string | null>(null);
  const current = rows.find((r) => r.id === editing) ?? null;
  const full = (r: TicketTypeRow) =>
    !!r.quantity && r.quantitySold >= Number(r.quantity);
  const status = (
    r: TicketTypeRow,
  ): { label: string; tone: BadgeTone; live: boolean } =>
    r.status === "ACTIVE" && full(r)
      ? { label: t("tableSoldOut"), tone: "dark", live: false }
      : {
          label: t(`status_${r.status}`),
          tone:
            r.status === "ACTIVE"
              ? "success"
              : r.status === "PAUSED"
                ? "warning"
                : "neutral",
          live: r.status === "ACTIVE",
        };
  const columns: TableColumn<TicketTypeRow>[] = [
    {
      key: "name",
      header: t("tableTicketType"),
      mobile: "title",
      cell: (r) => (
        <span className="grid min-w-0">
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            {r.name}
            {r.visibility !== "VISIBLE" ? (
              <Badge tone="lilas">{t(`visibility_${r.visibility}`)}</Badge>
            ) : null}
          </span>
          {r.description ? (
            <span className="truncate text-sm text-ink-muted">
              {r.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "price",
      header: t("tablePrice"),
      align: "right",
      width: "9rem",
      cell: (r) => (
        <span className="inline-grid justify-items-end gap-1">
          <span className="font-semibold">
            {r.priceMinor === 0
              ? t("free")
              : formatMoney(r.priceMinor, currency, locale)}
          </span>
          {r.tiers.length ? (
            <Badge tone="lilas">
              {t("tableTiers", { count: r.tiers.length })}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "sold",
      header: t("tableSold"),
      align: "right",
      width: "9rem",
      cell: (r) => (
        <span className="inline-grid justify-items-end gap-1">
          <span className="tabular-nums">
            {r.quantity ? `${r.quantitySold} / ${r.quantity}` : r.quantitySold}
          </span>
          {r.quantity ? (
            <span
              aria-hidden="true"
              className="block h-1 w-20 overflow-hidden rounded-full bg-surface-sunken"
            >
              <span
                className="block h-1 rounded-full bg-[var(--accent)]"
                style={{
                  width: `${Math.min(100, (r.quantitySold / Number(r.quantity)) * 100)}%`,
                }}
              />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "window",
      header: t("tableWindow"),
      cell: (r) =>
        r.salesStartLocal || r.salesEndLocal ? (
          <span className="grid text-sm">
            {r.salesStartLocal ? (
              <span>
                {t("tableFrom", { date: short(r.salesStartLocal, locale) })}
              </span>
            ) : null}
            {r.salesEndLocal ? (
              <span className="text-ink-muted">
                {t("tableUntil", { date: short(r.salesEndLocal, locale) })}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-ink-subtle">{t("tableAlways")}</span>
        ),
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      cell: (r) => {
        const s = status(r);
        return (
          <Badge tone={s.tone} dot live={s.live}>
            {s.label}
          </Badge>
        );
      },
    },
  ];
  if (manage)
    columns.push({
      key: "actions",
      header: <span className="sr-only">{t("tableActions")}</span>,
      align: "right",
      cell: (r) => {
        const i = rows.indexOf(r);
        return (
          <span className="inline-flex flex-wrap items-center justify-end gap-1">
            {i > 0 ? (
              <TicketTypeCommand
                orgSlug={orgSlug}
                eventId={eventId}
                id={r.id}
                command="up"
                label={t("moveUp")}
              />
            ) : null}
            {i < rows.length - 1 ? (
              <TicketTypeCommand
                orgSlug={orgSlug}
                eventId={eventId}
                id={r.id}
                command="down"
                label={t("moveDown")}
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setEditing(r.id)}
            >
              {t("edit")}
            </Button>
          </span>
        );
      },
    });
  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        caption={t("tableCaption")}
        emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
      />
      <Dialog
        open={!!current}
        onClose={() => setEditing(null)}
        title={current?.name ?? t("edit")}
        size="lg"
      >
        {current ? (
          <TicketTypeEditPanel
            orgSlug={orgSlug}
            eventId={eventId}
            row={current}
            terms={terms}
            tiersEnabled={tiersEnabled}
            tiersLocked={tiersLocked}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
