"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { resendManyAction } from "./actions";

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
  /** « 18,00 € remboursés », sous le montant. */
  refunded: string | null;
  /** « aujourd'hui », « hier », « 5 nov. » */
  day: string;
  time: string;
  dateAt: number;
  href: string | null;
}

// les cellules sur une ligne, comme la maquette (« .cmd td{white-space:nowrap} »)
const nowrap = "whitespace-nowrap";

/**
 * Commandes (refonte A3, maquette UIUX/pages-a3.html) : cases à cocher, numéro, acheteur, événement, billets, montant,
 * canal, statut et date ; la sélection ouvre la barre charbon des actions groupées. Commandes Evoly et billets des
 * réseaux dans un seul tableau, filtré par le canal ; une commande Evoly ouvre sa fiche.
 */
export function OrdersTable({
  rows,
  footer,
  caption,
  orgSlug,
  canManage,
  showEvent = true,
}: {
  rows: OrderRow[];
  footer?: ReactNode;
  caption: string;
  orgSlug: string;
  /** La colonne « Événement » (masquée dans l'onglet Participants d'un événement). */
  showEvent?: boolean;
  /** Renvoyer les billets, rembourser (droit de gérer les commandes). */
  canManage: boolean;
}) {
  const t = useTranslations("ordersAdmin");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const columns: TableColumn<OrderRow>[] = [
    {
      key: "reference",
      header: t("tableNumber"),
      sortable: true,
      mobile: "meta",
      className: `text-[13px] text-ink-muted ${nowrap}`,
    },
    {
      key: "name",
      header: t("tableBuyer"),
      sortable: true,
      mobile: "title",
      className: nowrap,
      cell: (o) => (
        <>
          <b className="font-medium">{o.name}</b>
          {/* billet d'un réseau dans un événement : son tarif et sa place, faute de colonne « Événement » */}
          {!showEvent && o.kind === "network" && o.event ? (
            <>
              <br />
              <small className="text-[12.5px] text-ink-muted">{o.event}</small>
            </>
          ) : null}
        </>
      ),
    },
    {
      key: "event",
      header: t("tableEvent"),
      sortable: true,
      mobile: "subtitle",
      className: nowrap,
      // sur téléphone (maquette « Sur téléphone ») : « 2 billets, Bal folk d'automne »
      cell: (o) => (
        <>
          <span className="md:hidden">
            {t("tickets", { count: o.tickets })}
            {o.event ? ", " : ""}
          </span>
          {o.event}
        </>
      ),
    },
    {
      key: "tickets",
      header: t("tableTickets"),
      sortable: true,
      align: "right",
      mobile: "hidden",
      className: nowrap,
    },
    {
      key: "total",
      header: t("tableTotal"),
      sortable: true,
      align: "right",
      mobile: "titleEnd",
      className: nowrap,
      sortValue: (o) => o.totalMinor,
      cell: (o) => (
        <>
          {o.total}
          {o.refunded ? (
            <span className="max-md:hidden">
              <br />
              <small className="text-[12.5px] text-ink-muted">
                {o.refunded}
              </small>
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "channel",
      header: t("tableChannel"),
      sortable: true,
      mobile: "hidden",
      className: nowrap,
      cell: (o) => <Badge>{o.channel}</Badge>,
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      className: nowrap,
      sortValue: (o) => o.statusLabel,
      cell: (o) => (
        <span className="inline-flex flex-wrap gap-1.5">
          <Badge tone={o.statusTone} dot>
            {o.statusLabel}
          </Badge>
          {o.extra.map((x) => (
            <Badge key={x.label} tone={x.tone} dot>
              {x.label}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: "date",
      header: t("tableDate"),
      sortable: true,
      mobile: "metaEnd",
      sortValue: (o) => o.dateAt,
      // sur téléphone : « aujourd'hui, 14:02 » sur une ligne
      cell: (o) =>
        o.day ? (
          <>
            <span className="max-md:hidden">
              {o.day}
              <br />
              <small className="text-[12.5px] text-ink-muted">{o.time}</small>
            </span>
            <span className="md:hidden">
              {o.day}, {o.time}
            </span>
          </>
        ) : null,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={showEvent ? columns : columns.filter((c) => c.key !== "event")}
      getRowId={(o) => `${o.kind}-${o.id}`}
      rowHref={(o) => o.href}
      caption={caption}
      mobileLines
      selectable={canManage}
      selectedLabel={(count) => notice ?? t("selectedCount", { count })}
      bulkActions={(ids) => {
        const orders = ids
          .filter((id) => id.startsWith("order-"))
          .map((id) => id.slice("order-".length));
        const bulk =
          "inline-flex h-[30px] items-center rounded-[8px] border border-sidebar-raised bg-sidebar-raised px-[13px] leading-[normal] font-medium text-white hover:brightness-125 disabled:opacity-50";
        return (
          <>
            <button
              type="button"
              className={bulk}
              disabled={pending || orders.length === 0}
              onClick={() =>
                start(async () => {
                  const r = await resendManyAction(orgSlug, orders);
                  if (r?.ok) {
                    setNotice(t("resentMany", { count: r.data }));
                    setTimeout(() => setNotice(null), 3000);
                  }
                })
              }
            >
              {t("resend")}
            </button>
            {/* un remboursement se décide billet par billet : il s'ouvre sur la fiche de la commande choisie */}
            {orders.length === 1 ? (
              <Link
                href={`/o/${orgSlug}/orders/${orders[0]}#rembourser`}
                className={bulk}
              >
                {t("refundSelected")}
              </Link>
            ) : null}
          </>
        );
      }}
      defaultSort={{ key: "date", dir: "desc" }}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
      footer={footer}
    />
  );
}
