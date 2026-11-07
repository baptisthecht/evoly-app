"use client";

import type { FeeTerms } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { SUP } from "@/components/ui/DateTimeField";
import { Gauge } from "@/components/ui/Gauge";
import { TicketTypeEditPanel, type TicketTypeRow } from "./TicketTypeEditor";

/** « 15 oct. », « 1er oct. » (le premier du mois en ordinal, en français). */
const dayMonth = (local: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
    .formatToParts(new Date(local))
    .map((p) =>
      p.type === "day" && locale === "fr" && p.value === "1" ? "1er" : p.value,
    )
    .join("");
/** Le jour seul (« 1er », « 16 »), pour une période dans un même mois. */
const dayOnly = (local: string, locale: string) => {
  const d = String(new Date(local).getDate());
  return locale === "fr" && d === "1" ? "1er" : d;
};
/** « 1er au 15 oct. » dans le même mois, « 16 oct. au 21 nov. » sinon (maquette). */
const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/**
 * Billetterie, tarifs (refonte A3, maquette UIUX/pages-a3.html) : le tableau dans l'ordre de la billetterie ; le nom et
 * les places, le prix, les ventes sur leur jauge (verte au complet), la période de vente, le statut. Un clic sur la ligne
 * ouvre le tarif dans une fenêtre (paliers, ordre, pause et archivage compris).
 */
export function TicketTypesTable({
  rows,
  orgSlug,
  eventId,
  terms,
  eventDay,
  currency,
  tiersEnabled,
  tiersLocked,
  manage,
}: {
  rows: TicketTypeRow[];
  orgSlug: string;
  eventId: string;
  terms: FeeTerms;
  eventDay?: string;
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
  const status = (r: TicketTypeRow): { label: string; tone: BadgeTone } =>
    r.status === "ACTIVE" && full(r)
      ? { label: t("tableSoldOut"), tone: "success" }
      : {
          label: t(`status_${r.status}`),
          tone:
            r.status === "ACTIVE"
              ? "success"
              : r.status === "PAUSED"
                ? "warning"
                : "neutral",
        };
  const window = (r: TicketTypeRow) => {
    const a = r.salesStartLocal;
    const b = r.salesEndLocal;
    if (a && b)
      return t("windowRange", {
        from: sameMonth(a, b) ? dayOnly(a, locale) : dayMonth(a, locale),
        to: dayMonth(b, locale),
      });
    if (a) return t("windowFrom", { from: dayMonth(a, locale) });
    if (b) return t("windowUntil", { to: dayMonth(b, locale) });
    return t("tableAlways");
  };
  const columns: TableColumn<TicketTypeRow>[] = [
    {
      key: "name",
      header: t("tableTicketType"),
      mobile: "title",
      cell: (r) => (
        <>
          <b className="font-semibold">{r.name}</b>
          {r.visibility !== "VISIBLE" ? (
            <>
              {" "}
              <Badge>{t(`visibility_${r.visibility}`)}</Badge>
            </>
          ) : null}
          <br />
          <small className="text-[12.5px] text-ink-muted">
            {[
              r.quantity
                ? t("places", { count: Number(r.quantity) })
                : t("unlimited"),
              r.description || null,
            ]
              .filter(Boolean)
              .join(", ")}
          </small>
        </>
      ),
    },
    {
      key: "price",
      header: t("tablePrice"),
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.priceMinor === 0
          ? t("free")
          : formatMoney(r.priceMinor, currency, locale),
    },
    {
      key: "sold",
      header: t("tableSold"),
      width: "240px",
      cell: (r) =>
        r.quantity ? (
          <>
            <div className="mb-[5px] text-[13px]">
              {t("soldOf", { sold: r.quantitySold, total: Number(r.quantity) })}
            </div>
            <Gauge
              ratio={r.quantitySold / Math.max(1, Number(r.quantity))}
              tone={full(r) ? "success" : "ink"}
            />
          </>
        ) : (
          <span className="text-[13px]">{r.quantitySold}</span>
        ),
    },
    {
      key: "window",
      header: t("tableWindow"),
      className: "whitespace-nowrap",
      // « 1er » avec « er » en exposant, comme la maquette
      cell: (r) =>
        window(r)
          .split(/(?<=\b1)(er)\b/)
          .map((part, i) =>
            i % 2 ? (
              <sup key={i} className={SUP}>
                {part}
              </sup>
            ) : (
              part
            ),
          ),
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      cell: (r) => {
        const s = status(r);
        return (
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
        );
      },
    },
  ];
  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={manage ? (r) => setEditing(r.id) : undefined}
        caption={t("tableCaption")}
        emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
      />
      <Dialog
        open={!!current}
        onClose={() => setEditing(null)}
        title={current?.name ?? t("edit")}
      >
        {current ? (
          <TicketTypeEditPanel
            orgSlug={orgSlug}
            eventId={eventId}
            row={current}
            terms={terms}
            eventDay={eventDay}
            tiersEnabled={tiersEnabled}
            tiersLocked={tiersLocked}
            onDone={() => setEditing(null)}
            position={{
              first: rows.indexOf(current) === 0,
              last: rows.indexOf(current) === rows.length - 1,
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
