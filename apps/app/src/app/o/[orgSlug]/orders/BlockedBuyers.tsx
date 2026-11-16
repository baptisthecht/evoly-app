"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useState } from "react";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { ExampleNote } from "@/components/ui/Controls";
import { DataTable, type TableColumn } from "@/components/ui/DataTable";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Field, Input, TEXTAREA_CLASS } from "@/components/ui/Field";
import { PlusIcon } from "@/components/ui/icons";
import { blockBuyerAction, unblockBuyerAction } from "./actions";

export interface BlockedBuyerItem {
  id: string;
  name: string | null;
  email: string | null;
  hasCard: boolean;
  reason: string | null;
  addedBy: string | null;
  /** « 16 nov. 2026 », dans le fuseau de l'organisation */
  date: string;
  dateAt: number;
}

/** Lien d'action d'une ligne, comme « Retirer » dans l'équipe. */
const LINK =
  "text-[13px] font-medium whitespace-nowrap underline underline-offset-[3px] hover:text-ink-muted disabled:opacity-50";

/**
 * Commandes, onglet « Personnes bloquées » : la liste propre à l'organisation (personne, adresse, carte enregistrée,
 * motif, auteur, date), avec « Débloquer ». Motif, auteur et date ne sont visibles que de l'organisation.
 */
export function BlockedBuyersTable({
  rows,
  orgSlug,
  canManage,
}: {
  rows: BlockedBuyerItem[];
  orgSlug: string;
  canManage: boolean;
}) {
  const t = useTranslations("ordersAdmin");
  const missing = (
    <span className="text-[13px] text-ink-muted">{t("blockedMissing")}</span>
  );
  const columns: TableColumn<BlockedBuyerItem>[] = [
    {
      key: "name",
      header: t("blockedPerson"),
      sortable: true,
      mobile: "title",
      cell: (b) =>
        b.name ? <b className="font-semibold">{b.name}</b> : missing,
    },
    {
      key: "email",
      header: t("blockedEmail"),
      sortable: true,
      mobile: "subtitle",
      cell: (b) =>
        b.email ? (
          <span className="text-[13.5px] break-all">{b.email}</span>
        ) : (
          missing
        ),
    },
    {
      key: "hasCard",
      header: t("blockedCard"),
      mobile: "badge",
      sortValue: (b) => (b.hasCard ? 1 : 0),
      cell: (b) =>
        b.hasCard ? (
          <Badge tone="warning" dot>
            {t("blockedCardYes")}
          </Badge>
        ) : (
          <span className="text-[13px] text-ink-muted">
            {t("blockedCardNo")}
          </span>
        ),
    },
    {
      key: "reason",
      header: t("blockedReason"),
      cell: (b) =>
        b.reason ? (
          <span className="line-clamp-2 text-[13px] text-ink-body">
            {b.reason}
          </span>
        ) : (
          missing
        ),
    },
    {
      key: "addedBy",
      header: t("blockedAddedBy"),
      sortable: true,
      cell: (b) => (b.addedBy ? <span>{b.addedBy}</span> : missing),
    },
    {
      key: "date",
      header: t("blockedDate"),
      sortable: true,
      sortValue: (b) => b.dateAt,
      cell: (b) => (
        <small className="text-[12.5px] whitespace-nowrap text-ink-muted">
          {b.date}
        </small>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">{t("blockedActions")}</span>,
            align: "right" as const,
            cell: (b: BlockedBuyerItem) => (
              <UnblockBuyer
                orgSlug={orgSlug}
                id={b.id}
                name={b.name ?? b.email ?? ""}
              />
            ),
          },
        ]
      : []),
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(b) => b.id}
      caption={t("blockedCaption")}
      defaultSort={{ key: "date", dir: "desc" }}
      emptyState={{
        title: t("blockedEmptyTitle"),
        description: t("blockedEmptyBody"),
        action: canManage ? <BlockBuyerDialog orgSlug={orgSlug} /> : undefined,
      }}
    />
  );
}

/** « Débloquer » : la personne peut de nouveau commander ; les commandes déjà signalées gardent leur pastille. */
export function UnblockBuyer({
  orgSlug,
  id,
  name,
}: {
  orgSlug: string;
  id: string;
  name: string;
}) {
  const t = useTranslations("ordersAdmin");
  const [state, action, pending] = useActionState(
    unblockBuyerAction.bind(null, orgSlug, id),
    null,
  );
  return (
    <form
      action={action}
      onSubmit={(e) =>
        window.confirm(t("unblockConfirm", { name }))
          ? undefined
          : e.preventDefault()
      }
    >
      <button type="submit" className={LINK} disabled={pending}>
        {t("unblock")}
      </button>
      <FormError state={state} />
    </form>
  );
}

/**
 * « Bloquer une personne » (bande du titre, onglet Personnes bloquées) et « Bloquer cet acheteur » (fiche d'une
 * commande) : une fenêtre avec l'adresse, le prénom, le nom et le motif. Depuis une commande, les champs sont
 * préremplis et les cartes de ses commandes dans l'organisation sont bloquées avec elle.
 */
export function BlockBuyerDialog({
  orgSlug,
  orderId = null,
  prefill,
  cards = 0,
  trigger,
  variant = "primary",
}: {
  orgSlug: string;
  orderId?: string | null;
  prefill?: { email: string; firstName: string; lastName: string };
  /** Depuis une commande : nombre de cartes reprises de ses commandes dans l'organisation. */
  cards?: number;
  trigger?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const t = useTranslations("ordersAdmin");
  const [open, setOpen] = useState(false);
  const title = orderId ? t("blockThisBuyer") : t("blockPerson");
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {trigger ?? (
          <>
            <PlusIcon />
            {title}
          </>
        )}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={t("blockIntro")}
      >
        <BlockBuyerForm
          orgSlug={orgSlug}
          orderId={orderId}
          prefill={prefill}
          cards={cards}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}

function BlockBuyerForm({
  orgSlug,
  orderId,
  prefill,
  cards,
  onDone,
}: {
  orgSlug: string;
  orderId: string | null;
  prefill?: { email: string; firstName: string; lastName: string };
  cards: number;
  onDone: () => void;
}) {
  const t = useTranslations("ordersAdmin");
  const { state, pending, formProps } = useActionForm(
    blockBuyerAction.bind(null, orgSlug, orderId),
    null,
  );
  const error = useFieldError(state);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const id = (k: string) => `block-${orderId ?? "new"}-${k}`;
  return (
    <form {...formProps} id={id("form")} className="grid gap-4" noValidate>
      <FormError state={state} />
      <Field
        label={t("blockedEmail")}
        htmlFor={id("email")}
        error={error("email")}
        hint={t("blockEmailHint")}
      >
        <Input
          id={id("email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          defaultValue={prefill?.email ?? ""}
          data-autofocus
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("firstName")}
          htmlFor={id("first")}
          error={error("firstName")}
        >
          <Input
            id={id("first")}
            name="firstName"
            autoComplete="off"
            defaultValue={prefill?.firstName ?? ""}
          />
        </Field>
        <Field
          label={t("lastName")}
          htmlFor={id("last")}
          error={error("lastName")}
        >
          <Input
            id={id("last")}
            name="lastName"
            autoComplete="off"
            defaultValue={prefill?.lastName ?? ""}
          />
        </Field>
      </div>
      <p className="-mt-2 text-[12.5px] text-ink-muted">{t("blockNameHint")}</p>
      <Field
        label={t("blockedReason")}
        htmlFor={id("reason")}
        error={error("reason")}
        hint={t("blockReasonHint")}
      >
        <textarea
          id={id("reason")}
          name="reason"
          rows={3}
          maxLength={500}
          className={TEXTAREA_CLASS}
        />
      </Field>
      {orderId ? (
        <ExampleNote>
          {cards > 0 ? t("blockCards", { count: cards }) : t("blockNoCard")}
        </ExampleNote>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" form={id("form")} disabled={pending}>
          {t("blockSubmit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
