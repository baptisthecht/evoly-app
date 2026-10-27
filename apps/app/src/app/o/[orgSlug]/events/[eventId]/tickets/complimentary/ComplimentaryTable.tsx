"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { ComplimentaryForm } from "../ComplimentaryForm";

export interface ComplimentaryRow {
  id: string;
  name: string;
  email: string;
  types: string;
  tickets: number;
  entered: number;
  sent: string;
  sentAt: number;
  href: string;
}

/** Billetterie, billets offerts : le tableau des invitations, et « Offrir des billets » dans une fenêtre. */
export function ComplimentaryTable({
  rows,
  orgSlug,
  eventId,
  ticketTypes,
  manage,
}: {
  rows: ComplimentaryRow[];
  orgSlug: string;
  eventId: string;
  ticketTypes: { id: string; name: string }[];
  manage: boolean;
}) {
  const t = useTranslations("complimentary");
  const [open, setOpen] = useState(false);
  const columns: TableColumn<ComplimentaryRow>[] = [
    {
      key: "name",
      header: t("tableGuest"),
      sortable: true,
      mobile: "title",
      cell: (r) => (
        <span className="grid min-w-0">
          <span className="truncate font-semibold">{r.name}</span>
          <span className="truncate text-sm text-ink-muted">{r.email}</span>
        </span>
      ),
    },
    {
      key: "types",
      header: t("tableTypes"),
      mobile: "subtitle",
      cell: (r) => <span className="line-clamp-2">{r.types}</span>,
    },
    {
      key: "tickets",
      header: t("tableTickets"),
      sortable: true,
      align: "right",
      width: "6rem",
    },
    {
      key: "entered",
      header: t("tableEntered"),
      sortable: true,
      mobile: "badge",
      cell: (r) =>
        r.entered >= r.tickets ? (
          <Badge tone="success" dot>
            {t("allIn")}
          </Badge>
        ) : r.entered > 0 ? (
          <Badge tone="info" dot>
            {t("someIn", { count: r.entered, total: r.tickets })}
          </Badge>
        ) : (
          <Badge>{t("notYet")}</Badge>
        ),
    },
    {
      key: "sent",
      header: t("tableSent"),
      sortable: true,
      align: "right",
      sortValue: (r) => r.sentAt,
      cell: (r) => <span className="text-ink-muted">{r.sent}</span>,
    },
  ];
  return (
    <div className="grid gap-4">
      {manage ? (
        <>
          <Button
            type="button"
            variant="dark"
            size="md"
            className="justify-self-start"
            onClick={() => setOpen(true)}
          >
            + {t("title")}
          </Button>
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            title={t("title")}
            size="lg"
          >
            <ComplimentaryForm
              orgSlug={orgSlug}
              eventId={eventId}
              ticketTypes={ticketTypes}
              inDialog
            />
          </Dialog>
        </>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        rowHref={(r) => r.href}
        caption={t("tableCaption")}
        defaultSort={{ key: "sent", dir: "desc" }}
        emptyState={{ title: t("emptyTitle"), description: t("emptyBody") }}
      />
    </div>
  );
}
