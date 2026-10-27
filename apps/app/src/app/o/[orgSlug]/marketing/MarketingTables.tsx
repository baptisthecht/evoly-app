"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
const Rate = ({ value }: { value: number | null }) =>
  value == null ? (
    <span className="text-ink-subtle">·</span>
  ) : (
    <span className="inline-grid justify-items-end gap-1">
      <span className="tabular-nums">{value} %</span>
      <span
        aria-hidden="true"
        className="block h-1 w-14 overflow-hidden rounded-full bg-surface-sunken"
      >
        <span
          className="block h-1 rounded-full bg-[var(--evoly-info)]"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </span>
    </span>
  );

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
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--evoly-lilas)] font-display text-sm text-[var(--evoly-charbon)]"
          >
            {initials(c.name)}
          </span>
          <span className="grid min-w-0">
            <span className="truncate font-semibold">{c.name}</span>
            <span className="truncate text-sm text-ink-muted">{c.email}</span>
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
  subject: string;
  status: string;
  statusLabel: string;
  recipients: number | null;
  opens: number | null;
  clicks: number | null;
  when: string;
  whenAt: number;
  href: string;
}

/** Marketing, campagnes : le tableau (campagne, statut, destinataires, ouvertures, clics, date). */
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
  const columns: TableColumn<CampaignRow>[] = [
    {
      key: "name",
      header: t("tableCampaign"),
      sortable: true,
      mobile: "title",
      cell: (c) => (
        <span className="grid min-w-0">
          <span className="truncate font-semibold">{c.name}</span>
          <span className="truncate text-sm text-ink-muted">
            « {c.subject} »
          </span>
        </span>
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
      cell: (c) =>
        c.recipients == null ? (
          <span className="text-ink-subtle">·</span>
        ) : (
          c.recipients
        ),
    },
    {
      key: "opens",
      header: t("tableOpens"),
      align: "right",
      sortable: true,
      cell: (c) => <Rate value={c.opens} />,
    },
    {
      key: "clicks",
      header: t("tableClicks"),
      align: "right",
      sortable: true,
      cell: (c) => <Rate value={c.clicks} />,
    },
    {
      key: "when",
      header: t("tableDate"),
      sortable: true,
      sortValue: (c) => c.whenAt,
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
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        {children}
      </Dialog>
    </>
  );
}
