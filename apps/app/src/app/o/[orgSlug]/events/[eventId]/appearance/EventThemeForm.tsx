"use client";

import { palette } from "@evoly/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  ThemeFields,
  ThemePreview,
  type ThemeValues,
} from "@/app/o/[orgSlug]/brand/BrandTheme";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import {
  choiceCardClass,
  SavedNote,
  SettingsRow,
} from "@/components/ui/Controls";
import { Field, Input } from "@/components/ui/Field";
import { saveEventThemeAction } from "./actions";

/** Style de la billetterie de cet événement : celui de l'organisation, ou des réglages propres (Pro). */
export function EventThemeForm({
  orgSlug,
  eventId,
  custom,
  values,
  name,
  logoUrl,
}: {
  orgSlug: string;
  eventId: string;
  custom: boolean;
  values: ThemeValues;
  name: string;
  logoUrl: string;
}) {
  const t = useTranslations("brand");
  const [mode, setMode] = useState<"organization" | "custom">(
    custom ? "custom" : "organization",
  );
  const [v, setV] = useState(values);
  const set = (patch: Partial<ThemeValues>) =>
    setV((x) => ({ ...x, ...patch }));
  const { state, pending, formProps } = useActionForm(
    saveEventThemeAction.bind(null, orgSlug, eventId),
    null,
  );
  return (
    // refonte A3 (maquette « Réglages de l'événement ») : une rangée ; l'éditeur et son aperçu prennent toute la largeur
    <SettingsRow title={t("eventStyleTitle")} wide={mode === "custom"}>
      <form {...formProps} className="grid gap-3.5" noValidate>
        <fieldset className="grid max-w-[560px] gap-2 sm:grid-cols-2">
          <legend className="sr-only">{t("eventStyleTitle")}</legend>
          {(["organization", "custom"] as const).map((m) => (
            <label key={m} className={choiceCardClass(mode === m)}>
              <span className="flex items-center gap-2.5 font-medium">
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {t(m === "organization" ? "eventStyleOrg" : "eventStyleCustom")}
              </span>
              <span className="text-[12.5px] text-ink-muted">
                {t(
                  m === "organization"
                    ? "eventStyleOrgHint"
                    : "eventStyleCustomHint",
                )}
              </span>
            </label>
          ))}
        </fieldset>
        {mode === "custom" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
            <div className="grid content-start gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {(["primaryColor", "accentColor"] as const).map((k) => (
                  <Field key={k} label={t(k)} htmlFor={`ev-${k}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={t(k)}
                        value={
                          /^#[0-9a-fA-F]{6}$/.test(v[k])
                            ? v[k]
                            : palette.charbon
                        }
                        onChange={(e) =>
                          set({ [k]: e.target.value.toUpperCase() })
                        }
                        className="size-10 shrink-0 cursor-pointer rounded-[8px] border border-line-strong bg-transparent p-0.5"
                      />
                      <Input
                        id={`ev-${k}`}
                        name={k}
                        value={v[k]}
                        onChange={(e) => set({ [k]: e.target.value })}
                        maxLength={9}
                      />
                    </div>
                  </Field>
                ))}
              </div>
              <ThemeFields v={v} set={set} socials={false} />
            </div>
            <div className="lg:sticky lg:top-6">
              <ThemePreview
                v={v}
                name={name}
                logoUrl={logoUrl}
                poweredBy={null}
                labels={{
                  date: t("previewDate"),
                  title: t("previewTitle"),
                  ticket: t("previewTicket"),
                  button: t("previewButton"),
                }}
              />
            </div>
          </div>
        ) : null}
        <FormError state={state} />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>{t("eventStyleSave")}</SubmitButton>
          {state?.ok ? (
            <SavedNote id="event-style-status">
              {t("eventStyleSaved")}
            </SavedNote>
          ) : null}
        </div>
      </form>
    </SettingsRow>
  );
}
