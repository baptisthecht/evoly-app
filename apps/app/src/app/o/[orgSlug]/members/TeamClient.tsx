"use client";

import { PERMISSION_GROUPS, type Permission } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { deleteRoleAction, invitationCommandAction, inviteAction, leaveAction, memberRoleAction, removeMemberAction, saveRoleAction, transferAction } from "./actions";

type RoleOption = { id: string; label: string };

export function InviteForm({ orgSlug, roles }: { orgSlug: string; roles: RoleOption[] }) {
  const t = useTranslations("team");
  const { state, pending, formProps } = useActionForm(inviteAction.bind(null, orgSlug), null);
  const error = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end" noValidate>
      <Field label={t("inviteEmail")} htmlFor="invite-email" error={error("email")}>
        <Input id="invite-email" name="email" type="email" inputMode="email" autoComplete="off" required />
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
      <SubmitButton pending={pending} className="w-full sm:w-auto">
        {t("invite")}
      </SubmitButton>
      <div className="sm:col-span-3">
        <FormError state={state} />
        {state?.ok ? <p className="text-sm text-success" role="status">{t("invited")}</p> : null}
      </div>
    </form>
  );
}

export function MemberRole({ orgSlug, memberId, roleId, roles }: { orgSlug: string; memberId: string; roleId: string; roles: RoleOption[] }) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(memberRoleAction.bind(null, orgSlug, memberId), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Select name="roleId" defaultValue={roleId} aria-label={t("role")} className="w-auto min-w-[10rem]" onChange={(e) => e.currentTarget.form?.requestSubmit()} disabled={pending}>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
      <FormError state={state} />
    </form>
  );
}

export function RemoveMember({ orgSlug, memberId, name }: { orgSlug: string; memberId: string; name: string }) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(removeMemberAction.bind(null, orgSlug, memberId), null);
  return (
    <form action={action} onSubmit={(e) => (window.confirm(t("confirmRemove", { name })) ? undefined : e.preventDefault())}>
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {t("remove")}
      </Button>
      <FormError state={state} />
    </form>
  );
}

export function InvitationActions({ orgSlug, invitationId }: { orgSlug: string; invitationId: string }) {
  const t = useTranslations("team");
  const [resendState, resend, resending] = useActionState(invitationCommandAction.bind(null, orgSlug, invitationId, "resend"), null);
  const [revokeState, revoke, revoking] = useActionState(invitationCommandAction.bind(null, orgSlug, invitationId, "revoke"), null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={resend}>
        <Button type="submit" size="sm" variant="secondary" disabled={resending}>
          {resendState?.ok ? t("resent") : t("resend")}
        </Button>
      </form>
      <form action={revoke}>
        <Button type="submit" size="sm" variant="ghost" disabled={revoking}>
          {t("revoke")}
        </Button>
      </form>
      <FormError state={resendState ?? revokeState} />
    </div>
  );
}

export function TransferOwnership({ orgSlug, members }: { orgSlug: string; members: Array<{ id: string; label: string }> }) {
  const t = useTranslations("team");
  const { state, pending, formProps } = useActionForm(transferAction.bind(null, orgSlug), null);
  if (members.length === 0) return <p className="text-sm text-ink-muted">{t("transferNobody")}</p>;
  return (
    <form {...formProps} onSubmit={(e) => (window.confirm(t("confirmTransfer")) ? formProps.onSubmit(e) : e.preventDefault())} className="flex flex-wrap items-end gap-2">
      <Field label={t("transferTo")} htmlFor="transfer-to">
        <Select id="transfer-to" name="memberId">
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton pending={pending} variant="dark">
        {t("transfer")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

export function LeaveOrganization({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(leaveAction.bind(null, orgSlug), null);
  return (
    <form action={action} onSubmit={(e) => (window.confirm(t("confirmLeave")) ? undefined : e.preventDefault())} className="grid gap-2">
      <Button type="submit" variant="ghost" size="sm" className="justify-self-start text-danger" disabled={pending}>
        {t("leave")}
      </Button>
      <FormError state={state} />
    </form>
  );
}

/** US-ORG-03 : éditeur de rôle personnalisé, permissions groupées ; celles que l'on n'a pas sont grisées (anti-escalade). */
export function RoleEditor({ orgSlug, role, allowed }: { orgSlug: string; role: { id: string; name: string; description: string; permissions: Permission[] } | null; allowed: Permission[] }) {
  const t = useTranslations("team");
  const tp = useTranslations("permissions");
  const [open, setOpen] = useState(!role ? false : false);
  const { state, pending, formProps } = useActionForm(saveRoleAction.bind(null, orgSlug, role?.id ?? null), null);
  const [delState, del, deleting] = useActionState(deleteRoleAction.bind(null, orgSlug, role?.id ?? ""), null);
  const error = useFieldError(state);
  if (!open)
    return (
      <Button type="button" size="sm" variant={role ? "secondary" : "dark"} onClick={() => setOpen(true)}>
        {role ? t("editRole") : `+ ${t("newRole")}`}
      </Button>
    );
  return (
    <Card className="grid gap-4">
      <form {...formProps} className="grid gap-4" noValidate>
        <FormError state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("roleName")} htmlFor={`role-name-${role?.id ?? "new"}`} error={error("name")}>
            <Input id={`role-name-${role?.id ?? "new"}`} name="name" defaultValue={role?.name ?? ""} maxLength={40} required />
          </Field>
          <Field label={t("roleDescription")} htmlFor={`role-desc-${role?.id ?? "new"}`}>
            <Input id={`role-desc-${role?.id ?? "new"}`} name="description" defaultValue={role?.description ?? ""} maxLength={200} />
          </Field>
        </div>
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.key} className="grid gap-2">
            <legend className="mb-1 font-label text-[0.8rem] font-bold">{t(`group_${g.key}`)}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.permissions.map((p) => (
                <label key={p} className={`flex items-center gap-3 text-sm ${allowed.includes(p) ? "" : "opacity-50"}`}>
                  <input type="checkbox" name="permissions" value={p} defaultChecked={role?.permissions.includes(p)} disabled={!allowed.includes(p)} className="size-5 accent-[var(--ink)]" />
                  {tp(p)}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending}>{t("saveRole")}</SubmitButton>
          <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </div>
      </form>
      {role ? (
        <form action={del} onSubmit={(e) => (window.confirm(t("confirmDeleteRole", { name: role.name })) ? undefined : e.preventDefault())}>
          <Button type="submit" size="sm" variant="ghost" className="text-danger" disabled={deleting}>
            {t("deleteRole")}
          </Button>
          <FormError state={delState} />
        </form>
      ) : null}
    </Card>
  );
}
