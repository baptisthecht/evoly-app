"use client";

import { PERMISSION_GROUPS, type Permission } from "@evoly/core";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useState } from "react";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { ExampleNote } from "@/components/ui/Controls";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { FilterSelect } from "@/components/ui/FilterSelect";
import {
  deleteRoleAction,
  invitationCommandAction,
  inviteAction,
  leaveAction,
  memberRoleAction,
  removeMemberAction,
  saveRoleAction,
  transferAction,
} from "./actions";

type RoleOption = { id: string; label: string };

/** Lien d'action d'une ligne (« .lnk » de la maquette) : 13 px, souligné, 12 px avant. */
const LINK =
  "ml-3 text-[13px] font-medium whitespace-nowrap underline underline-offset-[3px] hover:text-ink-muted disabled:opacity-50";

export function InviteForm({
  orgSlug,
  roles,
  onDone,
}: {
  orgSlug: string;
  roles: RoleOption[];
  onDone?: () => void;
}) {
  const t = useTranslations("team");
  const { state, pending, formProps } = useActionForm(
    inviteAction.bind(null, orgSlug),
    null,
  );
  const error = useFieldError(state);
  return (
    <form {...formProps} id="invite-form" className="grid gap-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("inviteEmail")}
          htmlFor="invite-email"
          error={error("email")}
        >
          <Input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            data-autofocus
          />
        </Field>
        <Field label={t("role")} htmlFor="invite-role">
          <Select id="invite-role" name="roleId" defaultValue={roles[0]?.id}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {state?.ok ? (
        <ExampleNote>
          <span role="status">{t("invited")}</span>
        </ExampleNote>
      ) : null}
      <DialogFooter>
        {onDone ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            {t("cancel")}
          </Button>
        ) : null}
        <Button type="submit" form="invite-form" disabled={pending}>
          {t("invite")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MemberRole({
  orgSlug,
  memberId,
  roleId,
  roles,
}: {
  orgSlug: string;
  memberId: string;
  roleId: string;
  roles: RoleOption[];
}) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(
    memberRoleAction.bind(null, orgSlug, memberId),
    null,
  );
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <FilterSelect
        variant="inline"
        name="roleId"
        defaultValue={roleId}
        aria-label={t("role")}
        valueLabel={roles.find((r) => r.id === roleId)?.label ?? ""}
        autoSubmit
        disabled={pending}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </FilterSelect>
      <FormError state={state} />
    </form>
  );
}

export function RemoveMember({
  orgSlug,
  memberId,
  name,
}: {
  orgSlug: string;
  memberId: string;
  name: string;
}) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(
    removeMemberAction.bind(null, orgSlug, memberId),
    null,
  );
  return (
    <form
      action={action}
      onSubmit={(e) =>
        window.confirm(t("confirmRemove", { name }))
          ? undefined
          : e.preventDefault()
      }
    >
      <button type="submit" className={LINK} disabled={pending}>
        {t("remove")}
      </button>
      <FormError state={state} />
    </form>
  );
}

export function InvitationActions({
  orgSlug,
  invitationId,
}: {
  orgSlug: string;
  invitationId: string;
}) {
  const t = useTranslations("team");
  const [resendState, resend, resending] = useActionState(
    invitationCommandAction.bind(null, orgSlug, invitationId, "resend"),
    null,
  );
  const [revokeState, revoke, revoking] = useActionState(
    invitationCommandAction.bind(null, orgSlug, invitationId, "revoke"),
    null,
  );
  return (
    <span className="inline-flex flex-wrap items-center justify-end">
      <form action={resend} className="contents">
        <button type="submit" className={LINK} disabled={resending}>
          {resendState?.ok ? t("resent") : t("resend")}
        </button>
      </form>
      <form action={revoke} className="contents">
        <button type="submit" className={LINK} disabled={revoking}>
          {t("revoke")}
        </button>
      </form>
      <FormError state={resendState ?? revokeState} />
    </span>
  );
}

export function TransferOwnership({
  orgSlug,
  members,
}: {
  orgSlug: string;
  members: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("team");
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(
    transferAction.bind(null, orgSlug),
    null,
  );
  if (members.length === 0)
    return <p className="text-[13px] text-ink-muted">{t("transferNobody")}</p>;
  return (
    <span>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("chooseOwner")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("transferTitle")}
        description={t("transferText")}
      >
        <form
          {...formProps}
          id="transfer-form"
          onSubmit={(e) =>
            window.confirm(t("confirmTransfer"))
              ? formProps.onSubmit(e)
              : e.preventDefault()
          }
          className="grid gap-4"
        >
          <FormError state={state} />
          <Field label={t("transferTo")} htmlFor="transfer-to">
            <Select id="transfer-to" name="memberId">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" form="transfer-form" disabled={pending}>
              {t("transfer")}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </span>
  );
}

export function LeaveOrganization({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(
    leaveAction.bind(null, orgSlug),
    null,
  );
  return (
    <form
      action={action}
      onSubmit={(e) =>
        window.confirm(t("confirmLeave")) ? undefined : e.preventDefault()
      }
      className="grid gap-2"
    >
      <Button
        type="submit"
        variant="secondary"
        className="justify-self-start text-danger"
        disabled={pending}
      >
        {t("leave")}
      </Button>
      <FormError state={state} />
    </form>
  );
}

/**
 * US-ORG-03 : rôle personnalisé, dans une fenêtre (refonte A3 : « les rôles créés s'ouvrent dans une fenêtre ») ;
 * permissions groupées, celles que l'on n'a pas sont grisées (anti-escalade). Ouvert par « Créer un rôle » (bande du
 * titre) ou par le nom du rôle en tête de la matrice.
 */
export function RoleEditor({
  orgSlug,
  role,
  allowed,
  trigger,
}: {
  orgSlug: string;
  role: {
    id: string;
    name: string;
    description: string;
    permissions: Permission[];
  } | null;
  allowed: Permission[];
  /** Ce qui ouvre la fenêtre : le bouton « Créer un rôle », ou le nom du rôle (titre de colonne de la matrice). */
  trigger: ReactNode;
}) {
  const t = useTranslations("team");
  const tp = useTranslations("permissions");
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(
    saveRoleAction.bind(null, orgSlug, role?.id ?? null),
    null,
  );
  const [delState, del, deleting] = useActionState(
    deleteRoleAction.bind(null, orgSlug, role?.id ?? ""),
    null,
  );
  const error = useFieldError(state);
  const formId = `role-form-${role?.id ?? "new"}`;
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <>
      {role ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="underline-offset-[3px] hover:underline"
        >
          {trigger}
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          {trigger}
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={role ? t("editRoleTitle", { name: role.name }) : t("createRole")}
        size="lg"
      >
        <form {...formProps} id={formId} className="grid gap-4" noValidate>
          <FormError state={state} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("roleName")}
              htmlFor={`role-name-${role?.id ?? "new"}`}
              error={error("name")}
            >
              <Input
                id={`role-name-${role?.id ?? "new"}`}
                name="name"
                defaultValue={role?.name ?? ""}
                maxLength={40}
                required
                data-autofocus
              />
            </Field>
            <Field
              label={t("roleDescription")}
              htmlFor={`role-desc-${role?.id ?? "new"}`}
            >
              <Input
                id={`role-desc-${role?.id ?? "new"}`}
                name="description"
                defaultValue={role?.description ?? ""}
                maxLength={200}
              />
            </Field>
          </div>
          {PERMISSION_GROUPS.map((g) => (
            <fieldset key={g.key} className="grid gap-2.5">
              <legend className="mb-1.5 text-[13px] font-semibold text-ink-muted">
                {t(`group_${g.key}`)}
              </legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {g.permissions.map((p) => (
                  <label
                    key={p}
                    className={`flex items-center gap-2.5 ${allowed.includes(p) ? "cursor-pointer" : "opacity-50"}`}
                  >
                    <input
                      type="checkbox"
                      name="permissions"
                      value={p}
                      defaultChecked={role?.permissions.includes(p)}
                      disabled={!allowed.includes(p)}
                    />
                    {tp(p)}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <DialogFooter>
            {role ? (
              <button
                type="submit"
                form={`${formId}-delete`}
                disabled={deleting}
                className="mr-auto text-[13px] font-medium text-danger underline underline-offset-[3px] disabled:opacity-50"
              >
                {t("deleteRole")}
              </button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {t("saveRole")}
            </Button>
          </DialogFooter>
        </form>
        {role ? (
          <form
            id={`${formId}-delete`}
            action={del}
            onSubmit={(e) =>
              window.confirm(t("confirmDeleteRole", { name: role.name }))
                ? undefined
                : e.preventDefault()
            }
          >
            <FormError state={delState} />
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
