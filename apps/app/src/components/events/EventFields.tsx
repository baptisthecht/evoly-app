"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { DateTimeField } from "../ui/DateTimeField";
import { Field, Input, Select, TEXTAREA_CLASS } from "../ui/Field";
import { segClass, segItemClass, SettingsRow } from "@/components/ui/Controls";
import { cn } from "../ui/cn";
import { AddressSearch, fillInput } from "@/components/places/AddressSearch";

export const TIMEZONES = [
  "Europe/Brussels",
  "Europe/Paris",
  "Europe/Luxembourg",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Lisbon",
  "Europe/Dublin",
  "Europe/London",
  "Europe/Helsinki",
  "UTC",
];

export interface EventFieldValues {
  atVenue?: boolean;
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
/** Salle du lieu partenaire qui a parrainé l'organisation (section 9.32). */
export type PartnerVenueOption = {
  name: string;
  addressLine1: string;
  postalCode: string | null;
  city: string | null;
};

export function EventFields({
  values,
  error,
  venue,
  show = { essentials: true, location: true },
}: {
  values: EventFieldValues;
  error: (name: string) => string | null;
  venue?: PartnerVenueOption | null;
  /** Sections montrées (réglages en parties) : les autres restent dans le formulaire, masquées, pour être enregistrées. */
  show?: { essentials: boolean; location: boolean };
}) {
  const t = useTranslations("events");
  const locale = useLocale();
  const [locationType, setLocationType] = useState(values.locationType);
  const [country, setCountry] = useState(values.country);
  const [atVenue, setAtVenue] = useState(!!venue && values.atVenue !== false);
  const zones = TIMEZONES.includes(values.timezone)
    ? TIMEZONES
    : [values.timezone, ...TIMEZONES];
  return (
    <>
      {/* refonte A3 (maquette Réglages) : une section, le titre à gauche, les champs à droite */}
      <SettingsRow
        fieldset
        hidden={!show.essentials}
        title={t("sectionEssentials")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("title")} htmlFor="title" error={error("title")}>
            <Input
              icon="type"
              id="title"
              name="title"
              defaultValue={values.title}
              maxLength={120}
              required
              invalid={!!error("title")}
            />
          </Field>
          <Field
            label={t("timezone")}
            htmlFor="timezone"
            error={error("timezone")}
          >
            <Select
              icon="globe"
              id="timezone"
              name="timezone"
              defaultValue={values.timezone}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* comme la maquette : « 21 nov. 2026, 20:00 » dans la langue de l'interface */}
          <Field
            label={t("startsAt")}
            htmlFor="startsAtLocal"
            error={error("startsAtLocal")}
          >
            <DateTimeField
              id="startsAtLocal"
              name="startsAtLocal"
              locale={locale}
              defaultValue={values.startsAtLocal}
              required
              invalid={!!error("startsAtLocal")}
            />
          </Field>
          <Field
            label={t("endsAt")}
            htmlFor="endsAtLocal"
            hint={t("optional")}
            error={error("endsAtLocal")}
          >
            <DateTimeField
              id="endsAtLocal"
              name="endsAtLocal"
              locale={locale}
              defaultValue={values.endsAtLocal}
              placeholder={t("endsAtEmpty")}
              invalid={!!error("endsAtLocal")}
            />
          </Field>
        </div>
        <Field
          label={t("summary")}
          htmlFor="summary"
          hint={t("summaryHint")}
          error={error("summary")}
        >
          <textarea
            id="summary"
            name="summary"
            defaultValue={values.summary}
            maxLength={280}
            rows={3}
            className={TEXTAREA_CLASS}
          />
        </Field>
      </SettingsRow>

      <SettingsRow
        fieldset
        hidden={!show.location}
        title={t("sectionLocation")}
      >
        {/* refonte A3 : un choix segmenté (« .seg »), comme les onglets en boutons */}
        <div
          className={cn(segClass, "w-fit")}
          role="radiogroup"
          aria-label={t("location")}
        >
          {(["PHYSICAL", "ONLINE", "HYBRID"] as const).map((v) => (
            <label key={v} className={segItemClass}>
              <input
                type="radio"
                name="locationType"
                value={v}
                checked={locationType === v}
                onChange={() => setLocationType(v)}
                className="sr-only"
              />
              {t(`locationType_${v}`)}
            </label>
          ))}
        </div>
        {venue && locationType !== "ONLINE" ? (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="atVenue"
              checked={atVenue}
              onChange={(e) => setAtVenue(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                {t("atVenue", { name: venue.name })}
              </span>
              <span className="block text-[13px] text-ink-muted">
                {[
                  venue.addressLine1,
                  [venue.postalCode, venue.city].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              <span className="block text-[12.5px] text-ink-muted">
                {t("atVenueInfo")}
              </span>
            </span>
          </label>
        ) : null}
        {locationType !== "ONLINE" && !(venue && atVenue) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("locationName")}
              htmlFor="locationName"
              error={error("locationName")}
            >
              <AddressSearch
                id="locationName"
                name="locationName"
                defaultValue={values.locationName}
                maxLength={120}
                placeholder={t("locationNamePlaceholder")}
                onSelect={(p) => {
                  // lieu choisi : adresse complète remplie (et enregistrée automatiquement dans les réglages)
                  fillInput(
                    document.getElementById(
                      "addressLine1",
                    ) as HTMLInputElement | null,
                    p.addressLine1,
                  );
                  fillInput(
                    document.getElementById(
                      "postalCode",
                    ) as HTMLInputElement | null,
                    p.postalCode,
                  );
                  fillInput(
                    document.getElementById("city") as HTMLInputElement | null,
                    p.city,
                  );
                  setCountry(p.country);
                }}
              />
            </Field>
            <Field
              label={t("address")}
              htmlFor="addressLine1"
              error={error("addressLine1")}
            >
              <Input
                icon="pin"
                id="addressLine1"
                name="addressLine1"
                defaultValue={values.addressLine1}
                maxLength={160}
                autoComplete="street-address"
              />
            </Field>
            {/* sur la même grille que les champs du dessus (12 px entre les colonnes) */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 sm:col-span-2 sm:grid-cols-2">
              <Field label={t("postalCode")} htmlFor="postalCode">
                <Input
                  icon="hash"
                  id="postalCode"
                  name="postalCode"
                  defaultValue={values.postalCode}
                  maxLength={16}
                  autoComplete="postal-code"
                />
              </Field>
              <Field label={t("city")} htmlFor="city">
                <Input
                  icon="building"
                  id="city"
                  name="city"
                  defaultValue={values.city}
                  maxLength={80}
                  autoComplete="address-level2"
                />
              </Field>
            </div>
            <input type="hidden" name="country" value={country} />
          </div>
        ) : null}
        {locationType !== "PHYSICAL" ? (
          <Field
            label={t("onlineUrl")}
            htmlFor="onlineUrl"
            hint={t("onlineUrlHint")}
            error={error("onlineUrl")}
          >
            <Input
              icon="link"
              id="onlineUrl"
              name="onlineUrl"
              type="url"
              inputMode="url"
              defaultValue={values.onlineUrl}
              placeholder="https://"
            />
          </Field>
        ) : null}
      </SettingsRow>
    </>
  );
}
