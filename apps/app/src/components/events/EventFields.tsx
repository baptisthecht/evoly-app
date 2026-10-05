"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field, Input, Select } from "../ui/Field";
import { cn } from "../ui/cn";

export const TIMEZONES = ["Europe/Brussels", "Europe/Paris", "Europe/Luxembourg", "Europe/Amsterdam", "Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "Europe/Madrid", "Europe/Rome", "Europe/Lisbon", "Europe/Dublin", "Europe/London", "Europe/Helsinki", "UTC"];

export interface EventFieldValues {
  title: string;
  summary: string;
  startsAtLocal: string;
  endsAtLocal: string;
  timezone: string;
  locationType: "PHYSICAL" | "ONLINE" | "HYBRID";
  locationName: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  country: string;
  onlineUrl: string;
}

/** Champs communs à la création et aux réglages : l'essentiel et le lieu (section 9.6). */
export function EventFields({ values, error }: { values: EventFieldValues; error: (name: string) => string | null }) {
  const t = useTranslations("events");
  const [locationType, setLocationType] = useState(values.locationType);
  const zones = TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES];
  return (
    <>
      <fieldset className="grid gap-5">
        <legend className="mb-1 font-display text-xl tracking-[var(--tracking-title)]">{t("sectionEssentials")}</legend>
        <Field label={t("title")} htmlFor="title" error={error("title")}>
          <Input id="title" name="title" defaultValue={values.title} maxLength={120} required invalid={!!error("title")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("startsAt")} htmlFor="startsAtLocal" error={error("startsAtLocal")}>
            <Input id="startsAtLocal" name="startsAtLocal" type="datetime-local" defaultValue={values.startsAtLocal} required invalid={!!error("startsAtLocal")} />
          </Field>
          <Field label={t("endsAt")} htmlFor="endsAtLocal" hint={t("optional")} error={error("endsAtLocal")}>
            <Input id="endsAtLocal" name="endsAtLocal" type="datetime-local" defaultValue={values.endsAtLocal} invalid={!!error("endsAtLocal")} />
          </Field>
        </div>
        <Field label={t("timezone")} htmlFor="timezone" error={error("timezone")}>
          <Select id="timezone" name="timezone" defaultValue={values.timezone}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("summary")} htmlFor="summary" hint={t("summaryHint")} error={error("summary")}>
          <textarea
            id="summary"
            name="summary"
            defaultValue={values.summary}
            maxLength={280}
            rows={3}
            className="block w-full rounded-md bg-surface-raised px-4 py-3 text-base shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]"
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-1 font-display text-xl tracking-[var(--tracking-title)]">{t("sectionLocation")}</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("location")}>
          {(["PHYSICAL", "ONLINE", "HYBRID"] as const).map((v) => (
            <label key={v} className={cn("flex h-11 cursor-pointer items-center justify-center rounded-md px-2 text-center text-sm font-medium shadow-[inset_0_0_0_1.5px_var(--line-strong)]", "has-[:checked]:bg-surface-inverse has-[:checked]:text-ink-inverse has-[:checked]:shadow-none")}>
              <input type="radio" name="locationType" value={v} checked={locationType === v} onChange={() => setLocationType(v)} className="sr-only" />
              {t(`locationType_${v}`)}
            </label>
          ))}
        </div>
        {locationType !== "ONLINE" ? (
          <div className="grid gap-5">
            <Field label={t("locationName")} htmlFor="locationName" error={error("locationName")}>
              <Input id="locationName" name="locationName" defaultValue={values.locationName} maxLength={120} placeholder={t("locationNamePlaceholder")} />
            </Field>
            <Field label={t("address")} htmlFor="addressLine1" error={error("addressLine1")}>
              <Input id="addressLine1" name="addressLine1" defaultValue={values.addressLine1} maxLength={160} autoComplete="street-address" />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5">
              <Field label={t("postalCode")} htmlFor="postalCode">
                <Input id="postalCode" name="postalCode" defaultValue={values.postalCode} maxLength={16} autoComplete="postal-code" />
              </Field>
              <Field label={t("city")} htmlFor="city">
                <Input id="city" name="city" defaultValue={values.city} maxLength={80} autoComplete="address-level2" />
              </Field>
            </div>
            <input type="hidden" name="country" value={values.country} />
          </div>
        ) : null}
        {locationType !== "PHYSICAL" ? (
          <Field label={t("onlineUrl")} htmlFor="onlineUrl" hint={t("onlineUrlHint")} error={error("onlineUrl")}>
            <Input id="onlineUrl" name="onlineUrl" type="url" inputMode="url" defaultValue={values.onlineUrl} placeholder="https://" />
          </Field>
        ) : null}
      </fieldset>
    </>
  );
}
