"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { BarActions } from "@/components/shell/EventTabs";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { FormError, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { createPromoAction, promoCommandAction } from "../../actions";
import { PlusIcon } from "@/components/ui/icons";

export function PromoForm({
  orgSlug,
  eventId,
  ticketTypes,
  currencySymbol,
}: {
  orgSlug: string;
  eventId: string;
  ticketTypes: Array<{ id: string; name: string; codeOnly: boolean }>;
  currencySymbol: string;
}) {
  const t = useTranslations("promo");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"PERCENT" | "AMOUNT" | "FREE">("PERCENT");
  const { state, pending, formProps } = useActionForm(
    createPromoAction.bind(null, orgSlug, eventId),
    null,
  );
  const error = useFieldError(state);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  // création d'un code : dans une fenêtre (centrée sur ordinateur, feuille sur téléphone) ; refonte A3 (maquette
  // « Tarifs ») : le bouton à droite des onglets en boutons (BarActions), les boutons de la fenêtre dans son pied
  return (
    <BarActions>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("new")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("new")}
        size="lg"
      >
        <form id="promo-form" {...formProps} className="grid gap-4" noValidate>
          <FormError state={state} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label={t("code")}
              htmlFor="promo-code"
              hint={t("codeHint")}
              error={error("code")}
            >
              <Input
                id="promo-code"
                name="code"
                maxLength={32}
                autoCapitalize="characters"
                className="uppercase"
              />
            </Field>
            <Field label={t("type")} htmlFor="promo-type">
              <Select
                id="promo-type"
                name="discountType"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                <option value="PERCENT">{t("type_PERCENT")}</option>
                <option value="AMOUNT">{t("type_AMOUNT")}</option>
                <option value="FREE">{t("type_FREE")}</option>
              </Select>
            </Field>
            {type === "PERCENT" ? (
              <Field
                label={`${t("percent")} (%)`}
                htmlFor="promo-percent"
                error={error("percent")}
              >
                <Input
                  id="promo-percent"
                  name="percent"
                  inputMode="decimal"
                  required
                />
              </Field>
            ) : type === "AMOUNT" ? (
              <Field
                label={`${t("amount")} (${currencySymbol})`}
                htmlFor="promo-amount"
                hint={t("amountHint")}
                error={error("amount")}
              >
                <Input
                  id="promo-amount"
                  name="amount"
                  inputMode="decimal"
                  required
                />
              </Field>
            ) : (
              <p className="self-end pb-3 text-[13px] text-ink-muted">
                {t("freeHint")}
              </p>
            )}
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-label text-[0.8rem] font-bold">
              {t("ticketTypes")}
            </legend>
            <p className="-mt-1 text-[12.5px] text-ink-muted">
              {t("ticketTypesHint")}
            </p>
            {ticketTypes.map((tt) => (
              <label key={tt.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="ticketTypeIds"
                  value={tt.id}
                  className="size-5 accent-[var(--ink)]"
                />
                {tt.name}
                {tt.codeOnly ? (
                  <span className="text-ink-muted">· {t("codeOnly")}</span>
                ) : null}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("maxUses")}
              htmlFor="promo-max"
              hint={t("unlimited")}
              error={error("maxUses")}
            >
              <Input
                id="promo-max"
                name="maxUses"
                type="number"
                min={1}
                inputMode="numeric"
              />
            </Field>
            <Field
              label={t("maxUsesPerEmail")}
              htmlFor="promo-max-email"
              hint={t("unlimited")}
              error={error("maxUsesPerEmail")}
            >
              <Input
                id="promo-max-email"
                name="maxUsesPerEmail"
                type="number"
                min={1}
                inputMode="numeric"
              />
            </Field>
            <Field
              label={t("raisesLimitTo")}
              htmlFor="promo-raises"
              hint={t("raisesLimitToHint")}
              error={error("raisesLimitTo")}
            >
              <Input
                id="promo-raises"
                name="raisesLimitTo"
                type="number"
                min={1}
                max={500}
              />
            </Field>
            <Field label={t("startsAt")} htmlFor="promo-start">
              <DateTimeField
                id="promo-start"
                name="startsAtLocal"
                locale={locale}
              />
            </Field>
            <Field label={t("expiresAt")} htmlFor="promo-end">
              <DateTimeField
                id="promo-end"
                name="expiresAtLocal"
                locale={locale}
              />
            </Field>
          </div>
          {ticketTypes.some((tt) => tt.codeOnly) ? (
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="unlocksHidden"
                className="size-5 accent-[var(--ink)]"
              />
              {t("unlocksHidden")}
            </label>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              form="promo-form"
              variant="primary"
              disabled={pending}
              aria-busy={pending}
            >
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </BarActions>
  );
}

export function PromoCommand({
  orgSlug,
  eventId,
  promoId,
  command,
  label,
}: {
  orgSlug: string;
  eventId: string;
  promoId: string;
  command: "activate" | "deactivate" | "delete";
  label: string;
}) {
  const [state, action, pending] = useActionState(
    promoCommandAction.bind(null, orgSlug, eventId, promoId, command),
    null,
  );
  return (
    <form action={action} className="contents">
      <Button
        type="submit"
        size="sm"
        variant={command === "delete" ? "ghost" : "secondary"}
        className={command === "delete" ? "text-danger" : undefined}
        disabled={pending}
      >
        {label}
      </Button>
      <FormError state={state} />
    </form>
  );
}
