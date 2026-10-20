"use client";

import { palette } from "@evoly/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ThemeFields, ThemePreview, type ThemeValues } from "@/app/o/[orgSlug]/brand/BrandTheme";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Card } from "@/components/ui/Card";
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
  const [mode, setMode] = useState<"organization" | "custom">(custom ? "custom" : "organization");
  const [v, setV] = useState(values);
  const set = (patch: Partial<ThemeValues>) => setV((x) => ({ ...x, ...patch }));
  const { state, pending, formProps } = useActionForm(saveEventThemeAction.bind(null, orgSlug, eventId), null);
  return (
    <Card className="grid gap-5">
      <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("eventStyleTitle")}</h2>
      <form {...formProps} className="grid gap-5" noValidate>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          {(["organization", "custom"] as const).map((m) => (
            <label key={m} className={`grid cursor-pointer gap-1 rounded-md p-3 ring-1 ${mode === m ? "bg-surface ring-ink" : "ring-line"}`}>
              <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                {t(m === "organization" ? "eventStyleOrg" : "eventStyleCustom")}
              </span>
              <span className="text-xs text-ink-muted">{t(m === "organization" ? "eventStyleOrgHint" : "eventStyleCustomHint")}</span>
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
                        value={/^#[0-9a-fA-F]{6}$/.test(v[k]) ? v[k] : palette.charbon}
                        onChange={(e) => set({ [k]: e.target.value.toUpperCase() })}
                        className="size-11 cursor-pointer rounded-md bg-transparent"
                      />
                      <Input id={`ev-${k}`} name={k} value={v[k]} onChange={(e) => set({ [k]: e.target.value })} className="font-mono" maxLength={9} />
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
                labels={{ date: t("previewDate"), title: t("previewTitle"), ticket: t("previewTicket"), button: t("previewButton") }}
              />
            </div>
          </div>
        ) : null}
        <FormError state={state} />
        {state?.ok ? (
          <p className="text-sm text-success" role="status">
            {t("eventStyleSaved")}
          </p>
        ) : null}
        <SubmitButton pending={pending} className="justify-self-start">
          {t("eventStyleSave")}
        </SubmitButton>
      </form>
    </Card>
  );
}
