"use client";

import { LOCALE_NAMES, LOCALES } from "@evoly/i18n";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { TIMEZONES } from "@/components/events/EventFields";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/Field";
import { deleteOrganizationAction, saveSettingsAction } from "./actions";

export interface SettingsValues {
  name: string;
  legalName: string;
  type: string;
  description: string;
  contactEmail: string;
  phone: string;
  website: string;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  vatNumber: string;
  vatRegistered: boolean;
}

/** Page Paramètres (section 9.3) : identité, contact, région, adresse et TVA des relevés. */
export function OrganizationSettingsForm({
  orgSlug,
  values,
  countries,
  currencies,
  currencyLocked,
  readOnly,
}: {
  orgSlug: string;
  values: SettingsValues;
  countries: Array<{ code: string; name: string }>;
  currencies: string[];
  currencyLocked: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations("orgSettings");
  const { state, pending, formProps } = useActionForm(saveSettingsAction.bind(null, orgSlug), null);
  const error = useFieldError(state);
  const zones = TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES];
  return (
    <form {...formProps} className="grid gap-8" noValidate>
      <FormError state={state} />
      <fieldset disabled={readOnly} className="grid gap-5">
        <legend className="mb-1 font-display text-lg tracking-[var(--tracking-title)]">{t("identity")}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="org-name" hint={t("nameHint")} error={error("name")}>
            <Input id="org-name" name="name" defaultValue={values.name} maxLength={80} required />
          </Field>
          <Field label={t("legalName")} htmlFor="org-legal" hint={t("legalNameHint")}>
            <Input id="org-legal" name="legalName" defaultValue={values.legalName} maxLength={160} />
          </Field>
          <Field label={t("type")} htmlFor="org-type">
            <Select id="org-type" name="type" defaultValue={values.type}>
              {["ASSOCIATION", "COMPANY", "INDIVIDUAL", "PUBLIC_BODY"].map((k) => (
                <option key={k} value={k}>
                  {t(`type_${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("website")} htmlFor="org-web" error={error("website")}>
            <Input id="org-web" name="website" defaultValue={values.website} placeholder="https://" inputMode="url" />
          </Field>
        </div>
        <Field label={t("description")} htmlFor="org-desc">
          <textarea
            id="org-desc"
            name="description"
            defaultValue={values.description}
            rows={3}
            maxLength={500}
            className="block w-full rounded-md bg-surface-raised px-4 py-3 text-base shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]"
          />
        </Field>
      </fieldset>

      <fieldset disabled={readOnly} className="grid gap-5">
        <legend className="mb-1 font-display text-lg tracking-[var(--tracking-title)]">{t("contact")}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("contactEmail")} htmlFor="org-email" hint={t("contactEmailHint")} error={error("contactEmail")}>
            <Input id="org-email" name="contactEmail" type="email" defaultValue={values.contactEmail} />
          </Field>
          <Field label={t("phone")} htmlFor="org-phone">
            <Input id="org-phone" name="phone" type="tel" defaultValue={values.phone} />
          </Field>
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className="grid gap-5">
        <legend className="mb-1 font-display text-lg tracking-[var(--tracking-title)]">{t("region")}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("country")} htmlFor="org-country">
            <Select id="org-country" name="country" defaultValue={values.country}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("currency")} htmlFor="org-currency" hint={currencyLocked ? t("currencyLocked") : undefined}>
            <Select id="org-currency" name="currency" defaultValue={values.currency} disabled={currencyLocked}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {currencyLocked ? <input type="hidden" name="currency" value={values.currency} /> : null}
          </Field>
          <Field label={t("locale")} htmlFor="org-locale" hint={t("localeHint")}>
            <Select id="org-locale" name="locale" defaultValue={values.locale}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("timezone")} htmlFor="org-tz">
            <Select id="org-tz" name="timezone" defaultValue={values.timezone}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className="grid gap-5">
        <legend className="mb-1 font-display text-lg tracking-[var(--tracking-title)]">{t("billing")}</legend>
        <p className="-mt-3 text-sm text-ink-muted">{t("billingHint")}</p>
        <Field label={t("address")} htmlFor="org-addr">
          <Input id="org-addr" name="addressLine1" defaultValue={values.addressLine1} autoComplete="street-address" />
        </Field>
        <Field label={t("address2")} htmlFor="org-addr2">
          <Input id="org-addr2" name="addressLine2" defaultValue={values.addressLine2} />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5">
          <Field label={t("postalCode")} htmlFor="org-pc">
            <Input id="org-pc" name="postalCode" defaultValue={values.postalCode} />
          </Field>
          <Field label={t("city")} htmlFor="org-city">
            <Input id="org-city" name="city" defaultValue={values.city} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
          <Field label={t("vatNumber")} htmlFor="org-vat" hint={t("vatNumberHint")} error={error("vatNumber")}>
            <Input id="org-vat" name="vatNumber" defaultValue={values.vatNumber} placeholder="BE0123456789" className="font-mono" />
          </Field>
          <label className="flex items-center gap-3 pb-3 text-sm">
            <input type="checkbox" name="vatRegistered" defaultChecked={values.vatRegistered} className="size-5 accent-[var(--ink)]" />
            {t("vatRegistered")}
          </label>
        </div>
      </fieldset>
      {state?.ok ? (
        <p className="text-sm text-success" role="status">
          {t("saved")}
        </p>
      ) : null}
      {!readOnly ? (
        <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
          {t("save")}
        </SubmitButton>
      ) : null}
    </form>
  );
}

/** RG-ORG-06 : suppression, double confirmation. */
export function DeleteOrganization({ orgSlug, name, blockers }: { orgSlug: string; name: string; blockers: string[] }) {
  const t = useTranslations("orgSettings");
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const { state, pending, formProps } = useActionForm(deleteOrganizationAction.bind(null, orgSlug), null);
  if (blockers.length > 0)
    return (
      <ul className="grid gap-2 text-sm">
        {blockers.map((b) => (
          <li key={b} className="rounded-md bg-surface-sunken px-4 py-3">
            {t(`blocker_${b}`)}
          </li>
        ))}
      </ul>
    );
  return (
    <form {...formProps} className="grid gap-4" noValidate>
      <FormError state={state} />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="understood"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--ink)]"
        />
        {t("deleteUnderstand")}
      </label>
      {understood ? (
        <Field label={t("deleteConfirmLabel", { name })} htmlFor="delete-confirm">
          <Input id="delete-confirm" name="confirmation" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      ) : null}
      <SubmitButton pending={pending} variant="danger" className="w-full sm:w-auto sm:justify-self-start">
        {t("deleteSubmit")}
      </SubmitButton>
      {understood && typed && typed.trim() !== name.trim() ? <p className="text-sm text-danger">{t("deleteMismatch")}</p> : null}
    </form>
  );
}
