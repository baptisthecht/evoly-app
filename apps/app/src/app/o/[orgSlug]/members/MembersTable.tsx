"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { InviteForm, MemberRole, RemoveMember } from "./TeamClient";
import { PlusIcon } from "@/components/ui/icons";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  joined: string;
  joinedAt: number;
  self: boolean;
  owner: boolean;
  suspended: boolean;
  roleId: string;
  roleLabel: string;
  editable: boolean;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/**
 * Équipe, membres (refonte A3, maquette UIUX/pages-a3-suite.html) : les initiales en gris neutre, le nom et l'adresse, le
 * rôle modifiable sur place (liste compacte), les événements, l'arrivée, « Retirer ».
 */
export function MembersTable({
  rows,
  roles,
  orgSlug,
}: {
  rows: MemberRow[];
  roles: { id: string; label: string }[];
  orgSlug: string;
}) {
  const t = useTranslations("team");
  const columns: TableColumn<MemberRow>[] = [
    {
      key: "name",
      header: t("tableMember"),
      sortable: true,
      mobile: "title",
      cell: (m) => (
        <span className="flex min-w-0 items-center gap-[11px]">
          <span
            aria-hidden="true"
            className="grid size-[30px] shrink-0 place-items-center rounded-full bg-avatar text-[11.5px] leading-[normal] font-semibold text-ink-soft"
          >
            {initials(m.name)}
          </span>
          <span className="min-w-0">
            <b className="block font-semibold">
              {m.name}
              {m.self ? (
                <span className="ml-1.5 rounded-[5px] bg-surface-sunken px-1.5 py-px text-[11.5px] font-semibold text-ink-soft">
                  {t("you")}
                </span>
              ) : null}
              {m.suspended ? (
                <span className="ml-1.5">
                  <Badge tone="warning" dot>
                    {t("suspended")}
                  </Badge>
                </span>
              ) : null}
            </b>
            <small className="text-[12.5px] text-ink-muted">{m.email}</small>
          </span>
        </span>
      ),
    },
    {
      key: "roleLabel",
      header: t("tableRole"),
      sortable: true,
      mobile: "badge",
      cell: (m) =>
        m.editable ? (
          <MemberRole
            orgSlug={orgSlug}
            memberId={m.id}
            roleId={m.roleId}
            roles={roles}
          />
        ) : (
          <span className="text-[13.5px] text-ink-body">{m.roleLabel}</span>
        ),
    },
    {
      key: "events",
      header: t("tableEvents"),
      cell: () => t("allEvents"),
    },
    {
      key: "joined",
      header: t("tableJoined"),
      sortable: true,
      sortValue: (m) => m.joinedAt,
      cell: (m) => (
        <small className="text-[12.5px] text-ink-muted">{m.joined}</small>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("tableActions")}</span>,
      align: "right",
      cell: (m) =>
        m.editable ? (
          <RemoveMember orgSlug={orgSlug} memberId={m.id} name={m.name} />
        ) : null,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(m) => m.id}
      caption={t("tableCaption")}
    />
  );
}

/** Équipe : « Inviter un membre », dans la bande du titre ; le formulaire dans une fenêtre. */
export function InviteDialog({
  orgSlug,
  roles,
}: {
  orgSlug: string;
  roles: { id: string; label: string }[];
}) {
  const t = useTranslations("team");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("inviteTitle")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("inviteTitle")}
      >
        <InviteForm
          orgSlug={orgSlug}
          roles={roles}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
