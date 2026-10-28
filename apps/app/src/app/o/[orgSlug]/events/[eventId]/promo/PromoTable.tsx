"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { PromoCommand } from "./PromoForm";

export interface PromoRow {
  id: string;
  code: string;
  active: boolean;
  unlocks: boolean;
  value: string;
  scope: string;
  used: number;
  max: number | null;
  until: string | null;
}

/** Vente, codes promo : le tableau (code, réduction, tarifs, utilisations, fin, statut, actions). */
export function PromoTable({
  rows,
  manage,
  orgSlug,
  eventId,
}: {
  rows: PromoRow[];
  manage: boolean;
  orgSlug: string;
  eventId: string;
}) {
  const t = useTranslations("promo");
  const columns: TableColumn<PromoRow>[] = [
    {
      key: "code",
      header: t("code"),
      sortable: true,
      mobile: "title",
      cell: (p) => (
        <span className="font-mono text-[0.95rem] font-semibold tracking-wide">
          {p.code}
        </span>
      ),
    },
    { key: "value", header: t("tableValue"), mobile: "subtitle" },
    {
      key: "scope",
      header: t("tableScope"),
      cell: (p) => (
        <span className="line-clamp-2 text-ink-muted">{p.scope}</span>
      ),
    },
    {
      key: "used",
      header: t("tableUses"),
      sortable: true,
      align: "right",
      width: "9rem",
      cell: (p) => (
        <span className="inline-grid justify-items-end gap-1">
          <span className="tabular-nums">
            {p.max != null
              ? t("usesOf", { used: p.used, max: p.max })
              : t("uses", { used: p.used })}
          </span>
          {p.max ? (
            <span
              aria-hidden="true"
              className="block h-1 w-16 overflow-hidden rounded-full bg-surface-sunken"
            >
              <span
                className="block h-1 rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.min(100, (p.used / p.max) * 100)}%` }}
              />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "until",
      header: t("tableUntil"),
      sortValue: (p) => p.until ?? "",
      cell: (p) =>
        p.until ?? <span className="text-ink-subtle">{t("noEnd")}</span>,
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      sortValue: (p) => (p.active ? 0 : 1),
      cell: (p) => (
        <span className="flex flex-wrap gap-1.5">
          <Badge tone={p.active ? "success" : "neutral"} live={p.active}>
            {p.active ? t("active") : t("inactive")}
          </Badge>
          {p.unlocks ? <Badge tone="lilas">{t("unlocks")}</Badge> : null}
        </span>
      ),
    },
  ];
  if (manage)
    columns.push({
      key: "actions",
      header: <span className="sr-only">{t("tableActions")}</span>,
      align: "right",
      mobile: "meta",
      cell: (p) => (
        <span className="inline-flex flex-wrap justify-end gap-2">
          <PromoCommand
            orgSlug={orgSlug}
            eventId={eventId}
            promoId={p.id}
            command={p.active ? "deactivate" : "activate"}
            label={p.active ? t("deactivate") : t("activate")}
          />
          {p.used === 0 ? (
            <PromoCommand
              orgSlug={orgSlug}
              eventId={eventId}
              promoId={p.id}
              command="delete"
              label={t("delete")}
            />
          ) : null}
        </span>
      ),
    });
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(p) => p.id}
      caption={t("tableCaption")}
      defaultSort={{ key: "status", dir: "asc" }}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
    />
  );
}
