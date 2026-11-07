"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { enableLastTicketsAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Gauge } from "@/components/ui/Gauge";
import { Dialog } from "@/components/ui/Dialog";

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
export interface ContactRow {
  id: string;
  name: string;
  email: string;
  consent: "yes" | "no" | "unsubscribed";
  consentLabel: string;
  orders: number;
  tickets: number;
  spent: string;
  spentMinor: number;
  last: string | null;
  lastAt: number;
}

/** Marketing, contacts : le tableau (contact, consentement, commandes, billets, dépenses, dernière commande). */
export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const t = useTranslations("marketing");
  const tone: Record<ContactRow["consent"], BadgeTone> = {
    yes: "success",
    no: "neutral",
    unsubscribed: "warning",
  };
  const columns: TableColumn<ContactRow>[] = [
    {
      key: "name",
      header: t("tableContact"),
      sortable: true,
      mobile: "title",
      cell: (c) => (
        // comme la maquette « Équipe, membres » : l'avatar de 30 px, le nom et l'adresse ; au moins 220 px, sans quoi le
        // tableau rognerait le nom
        <span className="flex min-w-[220px] items-center gap-[11px]">
          <span
            aria-hidden="true"
            className="grid size-[30px] shrink-0 place-items-center rounded-full bg-avatar text-[11.5px] leading-[normal] font-semibold text-ink-soft"
          >
            {initials(c.name)}
          </span>
          <span className="grid min-w-0">
            <span className="truncate font-semibold">{c.name}</span>
            {/* sans nom, l'adresse tient lieu de nom : pas deux fois la même ligne */}
            {c.name !== c.email ? (
              <span className="truncate text-[12.5px] text-ink-muted">
                {c.email}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "consent",
      header: t("tableConsent"),
      mobile: "badge",
      cell: (c) => (
        <Badge tone={tone[c.consent]} dot>
          {c.consentLabel}
        </Badge>
      ),
    },
    {
      key: "orders",
      header: t("tableOrders"),
      sortable: true,
      align: "right",
      width: "7rem",
    },
    {
      key: "tickets",
      header: t("tableTickets"),
      sortable: true,
      align: "right",
      width: "6rem",
    },
    {
      key: "spent",
      header: t("tableSpent"),
      sortable: true,
      align: "right",
      width: "8rem",
      sortValue: (c) => c.spentMinor,
    },
    {
      key: "last",
      header: t("tableLast"),
      sortable: true,
      sortValue: (c) => c.lastAt,
      cell: (c) => c.last ?? <span className="text-ink-subtle">·</span>,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(c) => c.id}
      caption={t("tableCaption")}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
    />
  );
}

export interface CampaignRow {
  id: string;
  name: string;
  /** « Objet : … » sous le nom. */
  subjectLine: string;
  status: string;
  statusLabel: string;
  recipients: number | null;
  /** Taux d'ouverture (%) et nombre d'ouvertures, une fois envoyée. */
  opensPct: number | null;
  opens: number | null;
  clicksPct: number | null;
  /** « 4 nov. » et « 10:00 » ; un brouillon : « modifiée le 25 oct. » seul. */
  day: string;
  time: string | null;
  whenAt: number;
  href: string;
}

const faint = <span className="text-ink-faint">-</span>;

/**
 * Marketing, campagnes (refonte A3, maquette UIUX/pages-a3-suite.html) : le nom et l'objet, le statut, les destinataires,
 * le taux d'ouverture sur sa jauge (et le nombre d'ouvertures), les clics, la date. Chaque chiffre a sa colonne.
 */
export function CampaignsTable({ rows }: { rows: CampaignRow[] }) {
  const t = useTranslations("campaigns");
  const tone = (s: string): BadgeTone =>
    s === "SENT"
      ? "success"
      : s === "SCHEDULED"
        ? "info"
        : s === "SENDING"
          ? "warning"
          : "neutral";
  const pct = (v: number) => `${v}\u00a0%`;
  const columns: TableColumn<CampaignRow>[] = [
    {
      key: "name",
      header: t("tableCampaign"),
      sortable: true,
      mobile: "title",
      cell: (c) => (
        <>
          <b className="block font-semibold">{c.name}</b>
          <small className="text-[12.5px] text-ink-muted">
            {c.subjectLine}
          </small>
        </>
      ),
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      cell: (c) => (
        <Badge tone={tone(c.status)} dot live={c.status === "SENDING"}>
          {c.statusLabel}
        </Badge>
      ),
    },
    {
      key: "recipients",
      header: t("tableRecipients"),
      align: "right",
      sortable: true,
      cell: (c) => (c.recipients == null ? faint : c.recipients),
    },
    {
      key: "opens",
      header: t("tableOpens"),
      width: "190px",
      sortable: true,
      sortValue: (c) => c.opensPct ?? -1,
      cell: (c) =>
        c.opensPct != null ? (
          <>
            <div className="mb-[5px] flex justify-between text-[13px]">
              <span>{pct(c.opensPct)}</span>
              <span className="text-[12.5px] text-ink-muted">{c.opens}</span>
            </div>
            <Gauge ratio={c.opensPct / 100} />
          </>
        ) : c.status === "SCHEDULED" ? (
          <span className="text-[13px] text-ink-faint">{t("notSentYet")}</span>
        ) : (
          <span className="text-[13px]">{faint}</span>
        ),
    },
    {
      key: "clicks",
      header: t("tableClicks"),
      align: "right",
      sortable: true,
      sortValue: (c) => c.clicksPct ?? -1,
      cell: (c) => (c.clicksPct == null ? faint : pct(c.clicksPct)),
    },
    {
      key: "when",
      header: t("tableDate"),
      sortable: true,
      sortValue: (c) => c.whenAt,
      className: "whitespace-nowrap",
      cell: (c) =>
        c.time ? (
          <>
            {c.day}
            <br />
            <small className="text-[12.5px] text-ink-muted">{c.time}</small>
          </>
        ) : (
          <small className="text-[12.5px] text-ink-muted">{c.day}</small>
        ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(c) => c.id}
      rowHref={(c) => c.href}
      caption={t("tableCaption")}
      emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
    />
  );
}

/** Marketing : importer des contacts, dans une fenêtre. */
export function ImportDialog({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        {children}
      </Dialog>
    </>
  );
}

/** « Activer » du bandeau « Dernières places » (refonte A3) : l'e-mail automatique se met en route d'un clic. */
export function EnableLastTickets({
  orgSlug,
  eventId,
  label,
}: {
  orgSlug: string;
  eventId: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          await enableLastTicketsAction(orgSlug, eventId);
        })
      }
    >
      {label}
    </Button>
  );
}
