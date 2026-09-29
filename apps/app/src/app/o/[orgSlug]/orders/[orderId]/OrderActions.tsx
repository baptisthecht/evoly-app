"use client";

import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { correctEmailAction, decideRefundAction, holderAction, refundTicketsAction, resendTicketsAction, revertCheckInAction } from "../actions";

export function ResendTickets({ orgSlug, orderId }: { orgSlug: string; orderId: string }) {
  const t = useTranslations("ordersAdmin");
  const [state, action] = useActionState(resendTicketsAction.bind(null, orgSlug, orderId), null);
  return (
    <form action={action} className="grid gap-2">
      <SubmitButton variant="secondary" className="w-full sm:w-auto">
        {t("resend")}
      </SubmitButton>
      {state?.ok ? <p className="text-sm text-success" role="status">{t("resent")}</p> : <FormError state={state} />}
    </form>
  );
}

export function CorrectEmail({ orgSlug, orderId, email }: { orgSlug: string; orderId: string; email: string }) {
  const t = useTranslations("ordersAdmin");
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(correctEmailAction.bind(null, orgSlug, orderId), null);
  const error = useFieldError(state);
  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t("correctEmail")}
      </Button>
    );
  return (
    <form {...formProps} className="grid gap-3" noValidate>
      <FormError state={state} />
      <Field label={t("newEmail")} htmlFor="new-email" hint={t("newEmailHint")} error={error("email")}>
        <Input id="new-email" name="email" type="email" defaultValue={email} required />
      </Field>
      {state?.ok ? <p className="text-sm text-success" role="status">{t("emailCorrected")}</p> : null}
      <div className="flex gap-2">
        <SubmitButton pending={pending} className="w-full sm:w-auto">
          {t("saveEmail")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export function HolderForm({ orgSlug, orderId, ticketId, firstName, lastName }: { orgSlug: string; orderId: string; ticketId: string; firstName: string; lastName: string }) {
  const t = useTranslations("ordersAdmin");
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(holderAction.bind(null, orgSlug, orderId, ticketId), null);
  if (!open)
    return (
      <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => setOpen(true)}>
        {firstName ? t("editHolder") : t("addHolder")}
      </button>
    );
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <Input name="firstName" defaultValue={firstName} placeholder={t("firstName")} aria-label={t("firstName")} />
      <Input name="lastName" defaultValue={lastName} placeholder={t("lastName")} aria-label={t("lastName")} />
      <SubmitButton pending={pending} className="w-full sm:w-auto">
        {t("save")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

/** US-REF-03 et RG-REF-05 : choix des billets, mention des frais non restitués avant validation. */
export function RefundTickets({ orgSlug, orderId, tickets, currency }: { orgSlug: string; orderId: string; tickets: Array<{ id: string; label: string; faceValueMinor: number; scanned: boolean }>; currency: string }) {
  const t = useTranslations("ordersAdmin");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { state, pending, formProps } = useActionForm(refundTicketsAction.bind(null, orgSlug, orderId), null);
  const total = tickets.filter((tk) => selected.includes(tk.id)).reduce((n, tk) => n + tk.faceValueMinor, 0);
  if (tickets.length === 0) return null;
  if (!open)
    return (
      <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(true)}>
        {t("refund")}
      </Button>
    );
  return (
    <form {...formProps} onSubmit={(e) => (window.confirm(t("confirmRefund", { amount: formatMoney(total, currency, locale) })) ? formProps.onSubmit(e) : e.preventDefault())} className="grid gap-4 rounded-md bg-surface-sunken p-4">
      <FormError state={state} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">{t("refundWhich")}</legend>
        <p className="mb-2 text-xs text-ink-muted">{t("feesNotReturned")}</p>
        {tickets.map((tk) => (
          <label key={tk.id} className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="ticketIds" value={tk.id} checked={selected.includes(tk.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, tk.id] : s.filter((x) => x !== tk.id)))} className="size-5 accent-[var(--ink)]" />
            {tk.label} · {tk.faceValueMinor === 0 ? t("free") : formatMoney(tk.faceValueMinor, currency, locale)}
            {tk.scanned ? <span className="text-ink-muted">· {t("scanned")}</span> : null}
          </label>
        ))}
      </fieldset>
      <Field label={t("reason")} htmlFor="refund-reason">
        <Select id="refund-reason" name="reason" defaultValue="OTHER">
          {(["OTHER", "BUYER_REQUEST", "DUPLICATE", "FRAUD"] as const).map((r) => (
            <option key={r} value={r}>
              {t(`reason_${r}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("messageToBuyer")} htmlFor="refund-message" hint={t("optional")}>
        <Input id="refund-message" name="message" maxLength={500} />
      </Field>
      <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{t("feesNotReturned")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="dark" className="w-full sm:w-auto">
          {selected.length ? t("refundAmount", { amount: formatMoney(total, currency, locale) }) : t("refundPick")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export function RefundDecision({ orgSlug, orderId, refundId, mode }: { orgSlug: string; orderId: string; refundId: string; mode: "pending" | "failed" }) {
  const t = useTranslations("ordersAdmin");
  const [approveState, approve] = useActionState(decideRefundAction.bind(null, orgSlug, orderId, refundId, "approve"), null);
  const [rejectState, reject] = useActionState(decideRefundAction.bind(null, orgSlug, orderId, refundId, "reject"), null);
  const [retryState, retry] = useActionState(decideRefundAction.bind(null, orgSlug, orderId, refundId, "retry"), null);
  if (mode === "failed")
    return (
      <form action={retry} className="grid gap-2">
        <SubmitButton variant="dark" className="w-full sm:w-auto">
          {t("retry")}
        </SubmitButton>
        <FormError state={retryState} />
      </form>
    );
  return (
    <form className="grid gap-3">
      <Field label={t("responseMessage")} htmlFor={`resp-${refundId}`} hint={t("optional")}>
        <Input id={`resp-${refundId}`} name="message" maxLength={500} />
      </Field>
      <p className="text-xs text-ink-muted">{t("feesNotReturned")}</p>
      <div className="flex flex-wrap gap-2">
        <button formAction={approve} className="h-11 rounded-full bg-surface-inverse px-5 font-semibold text-ink-inverse">
          {t("approve")}
        </button>
        <button formAction={reject} className="h-11 rounded-full px-5 font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]">
          {t("reject")}
        </button>
      </div>
      <FormError state={approveState ?? rejectState} />
    </form>
  );
}

/** RG-SCN-02 : annuler une entrée scannée par erreur (motif obligatoire, journalisé). */
export function RevertCheckIn({ orgSlug, orderId, ticketId }: { orgSlug: string; orderId: string; ticketId: string }) {
  const t = useTranslations("ordersAdmin");
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(revertCheckInAction.bind(null, orgSlug, orderId, ticketId), null);
  const error = useFieldError(state);
  if (!open)
    return (
      <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => setOpen(true)}>
        {t("revertCheckIn")}
      </button>
    );
  return (
    <form {...formProps} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" noValidate>
      <Field label={t("revertReason")} htmlFor={`revert-${ticketId}`} error={error("note")}>
        <Input id={`revert-${ticketId}`} name="note" maxLength={300} placeholder={t("revertPlaceholder")} />
      </Field>
      <div className="flex items-end">
        <SubmitButton pending={pending} variant="dark" className="w-full sm:w-auto">
          {t("revertSubmit")}
        </SubmitButton>
      </div>
      <div className="sm:col-span-2">
        <FormError state={state} />
      </div>
    </form>
  );
}
