"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { InviteForm, MemberRole, RemoveMember } from "./TeamClient";

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

/** Équipe, membres : le tableau (membre, rôle modifiable sur place, arrivée, statut, retrait). */
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
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm ${m.owner ? "bg-surface-inverse text-ink-inverse" : "bg-[var(--accent)] text-[var(--accent-ink)]"}`}
          >
            {initials(m.name)}
          </span>
          <span className="grid min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {m.name}
              {m.self ? <Badge>{t("you")}</Badge> : null}
            </span>
            <span className="truncate text-sm text-ink-muted">{m.email}</span>
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
          <Badge tone={m.owner ? "dark" : "neutral"}>{m.roleLabel}</Badge>
        ),
    },
    {
      key: "joined",
      header: t("tableJoined"),
      sortable: true,
      sortValue: (m) => m.joinedAt,
    },
    {
      key: "status",
      header: t("tableStatus"),
      mobile: "badge",
      cell: (m) =>
        m.suspended ? (
          <Badge tone="warning" dot>
            {t("suspended")}
          </Badge>
        ) : (
          <Badge tone="success" dot>
            {t("activeMember")}
          </Badge>
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

/** Équipe : inviter un membre, dans une fenêtre. */
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
      <Button
        type="button"
        variant="dark"
        size="md"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        + {t("inviteTitle")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("inviteTitle")}
      >
        <InviteForm orgSlug={orgSlug} roles={roles} />
      </Dialog>
    </>
  );
}
