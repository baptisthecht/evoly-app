"use client";

import { BRAND_FONTS, BRAND_PRESETS, BRAND_RADII, brandCssVars, brandWarnings, type BrandStyle } from "@evoly/ui";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import "@evoly/ui/brand-fonts.css";
import { Field, Input, Select } from "@/components/ui/Field";

export type SocialKey = "website" | "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube";
export const SOCIAL_KEYS: SocialKey[] = ["website", "instagram", "facebook", "tiktok", "linkedin", "youtube"];
export interface ThemeValues {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  radius: string;
  headingFont: string;
  bodyFont: string;
  buttonLabel: string;
  socials: Record<SocialKey, string>;
}
const RADIUS_PX: Record<string, string> = { "": "18px", square: "0px", soft: "6px", medium: "10px", round: "18px", extra: "26px" };
export const styleOf = (v: ThemeValues): BrandStyle => ({
  primaryColor: v.primaryColor || null,
  accentColor: v.accentColor || null,
  backgroundColor: v.backgroundColor || null,
  radius: v.radius || null,
  headingFont: v.headingFont || null,
  bodyFont: v.bodyFont || null,
});

/** Styles prêts à l'emploi, fond, arrondi, polices, lisibilité, bouton d'achat, réseaux sociaux (offre Pro). */
export function ThemeFields({ v, set }: { v: ThemeValues; set: (patch: Partial<ThemeValues>) => void }) {
  const t = useTranslations("brand");
  const warnings = brandWarnings(styleOf(v));
  const fonts = Object.entries(BRAND_FONTS) as Array<[keyof typeof BRAND_FONTS, (typeof BRAND_FONTS)[keyof typeof BRAND_FONTS]]>;
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[0.8125rem] font-medium">{t("styles")}</legend>
        <p className="text-xs text-ink-muted">{t("stylesHint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() =>
                set({
                  primaryColor: p.primaryColor,
                  accentColor: p.accentColor,
                  backgroundColor: p.backgroundColor ?? "",
                  radius: p.radius ?? "",
                  headingFont: p.headingFont ?? "",
                  bodyFont: p.bodyFont ?? "",
                })
              }
              className="flex min-h-11 items-center gap-2.5 rounded-md bg-surface-raised px-3 py-2 text-left text-[0.8125rem] font-medium ring-1 ring-line hover:ring-ink"
            >
              <span aria-hidden="true" className="flex shrink-0">
                {[p.backgroundColor ?? "#FFF6F0", p.primaryColor, p.accentColor].map((c, i) => (
                  <span key={i} className="-ml-1 size-4 rounded-full ring-2 ring-surface-raised first:ml-0" style={{ background: c }} />
                ))}
              </span>
              {t(`preset_${p.key}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={t("backgroundColor")} htmlFor="backgroundColor" hint={t("backgroundHint")}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t("backgroundColor")}
            value={/^#[0-9a-fA-F]{6}$/.test(v.backgroundColor) ? v.backgroundColor : "#FFF6F0"}
            onChange={(e) => set({ backgroundColor: e.target.value.toUpperCase() })}
            className="size-11 cursor-pointer rounded-md bg-transparent"
          />
          <Input
            id="backgroundColor"
            name="backgroundColor"
            value={v.backgroundColor}
            onChange={(e) => set({ backgroundColor: e.target.value })}
            placeholder="#FFF6F0"
            className="font-mono"
            maxLength={9}
          />
          {v.backgroundColor ? (
            <button
              type="button"
              onClick={() => set({ backgroundColor: "" })}
              className="shrink-0 text-[0.8125rem] text-ink-muted underline-offset-4 hover:underline"
            >
              {t("useDefault")}
            </button>
          ) : null}
        </div>
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[0.8125rem] font-medium">{t("radius")}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {["", ...BRAND_RADII].map((r) => (
            <label
              key={r || "default"}
              className={`grid cursor-pointer justify-items-center gap-1.5 rounded-md p-2 text-xs ring-1 ${v.radius === r ? "bg-surface ring-ink" : "ring-line"}`}
            >
              <input type="radio" name="radius" value={r} checked={v.radius === r} onChange={() => set({ radius: r })} className="sr-only" />
              <span aria-hidden="true" className="h-6 w-10 border-2 border-ink" style={{ borderRadius: RADIUS_PX[r] }} />
              {t(`radius_${r || "default"}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["headingFont", "bodyFont"] as const).map((k) => (
          <Field key={k} label={t(k)} htmlFor={k}>
            <Select id={k} name={k} value={v[k]} onChange={(e) => set({ [k]: e.target.value })}>
              <option value="">{t("fontDefault")}</option>
              {fonts
                .filter(([, f]) => k === "headingFont" || f.body)
                .map(([key, f]) => (
                  <option key={key} value={key}>
                    {f.label}
                  </option>
                ))}
            </Select>
            <span className="text-lg" style={{ fontFamily: v[k] && v[k] in BRAND_FONTS ? BRAND_FONTS[v[k] as keyof typeof BRAND_FONTS].family : undefined }}>
              {t("fontSample")}
            </span>
          </Field>
        ))}
      </div>

      <section aria-label={t("readability")} className="grid gap-2 rounded-md bg-surface p-3 ring-1 ring-line">
        <p className="text-[0.8125rem] font-medium">{t("readability")}</p>
        {warnings.length ? (
          warnings.map((w) => (
            <p key={w.key} role="alert" className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink">
              {t(`warn_${w.key}`, { ratio: w.ratio })}
              <button
                type="button"
                onClick={() => set(w.key === "panelText" ? { primaryColor: w.suggestion } : { accentColor: w.suggestion })}
                className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium ring-1 ring-line-strong hover:ring-ink"
              >
                <span aria-hidden="true" className="size-3 rounded-full" style={{ background: w.suggestion }} />
                {t("useSuggestion", { color: w.suggestion })}
              </button>
            </p>
          ))
        ) : (
          <p className="text-[0.8125rem] text-success">{t("readable")}</p>
        )}
      </section>

      <Field label={t("buttonLabel")} htmlFor="buttonLabel" hint={t("buttonLabelHint")}>
        <Input id="buttonLabel" name="buttonLabel" value={v.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} maxLength={40} />
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-[0.8125rem] font-medium">{t("socials")}</legend>
        <p className="text-xs text-ink-muted">{t("socialsHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_KEYS.map((k) => (
            <Field key={k} label={t(`social_${k}`)} htmlFor={`social_${k}`}>
              <Input
                id={`social_${k}`}
                name={`social_${k}`}
                type="url"
                inputMode="url"
                value={v.socials[k]}
                onChange={(e) => set({ socials: { ...v.socials, [k]: e.target.value } })}
                placeholder={k === "website" ? "https://" : `https://${k === "youtube" ? "youtube.com" : `${k}.com`}/`}
                maxLength={300}
              />
            </Field>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Aperçu en direct : le même calcul que la billetterie (brandCssVars), appliqué à une page d'événement réduite. */
export function ThemePreview({
  v,
  name,
  logoUrl,
  poweredBy,
  labels,
}: {
  v: ThemeValues;
  name: string;
  logoUrl: string;
  poweredBy: string | null;
  labels: { date: string; title: string; ticket: string; button: string };
}) {
  // l'application a son propre thème : l'aperçu repart de la charte des billetteries, puis applique la marque
  const charte = {
    "--type-display": BRAND_FONTS["archivo-black"].family,
    "--type-body": BRAND_FONTS.poppins.family,
    "--surface": "#FFF6F0",
    "--surface-raised": "#FFFFFF",
    "--ink": "#222222",
    "--ink-muted": "#5E5752",
    "--line": "#EADFD6",
    "--r-sm": "8px",
    "--r-md": "12px",
    "--r-lg": "18px",
    "--control-radius": "999px",
  };
  const style = {
    ...charte,
    ...brandCssVars({ ...styleOf(v), primaryColor: v.primaryColor || "#222222", accentColor: v.accentColor || v.primaryColor || "#FFB8E8" }),
  } as CSSProperties;
  const socials = SOCIAL_KEYS.filter((k) => v.socials[k]);
  return (
    <div className="overflow-hidden rounded-lg bg-surface text-ink ring-1 ring-line [font-family:var(--type-body)]" style={style} data-testid="brand-preview">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-auto" /> : <span className="font-display">{name}</span>}
        {poweredBy ? <span className="text-[0.65rem] text-ink-muted">{poweredBy}</span> : null}
      </div>
      <div className="grid gap-2 bg-[var(--accent-panel)] px-4 py-6 text-[var(--accent-panel-ink)]">
        <span className="w-fit rounded-[var(--r-sm)] bg-[var(--accent)] px-2 py-0.5 text-[0.65rem] font-bold text-[var(--accent-ink)]">{labels.date}</span>
        <span className="font-display text-2xl leading-none [font-family:var(--type-display)]">{labels.title}</span>
      </div>
      <div className="grid gap-2 p-4">
        <div className="grid gap-2 rounded-[var(--r-lg)] bg-surface-raised p-4 ring-1 ring-line">
          <span className="text-sm font-semibold">{labels.ticket}</span>
          <span className="rounded-[var(--control-radius)] bg-[var(--btn-primary-bg)] py-2.5 text-center text-sm font-semibold text-[var(--btn-primary-ink)]">
            {v.buttonLabel || labels.button}
          </span>
        </div>
        {socials.length ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {socials.map((k) => (
              <span key={k} className="rounded-[var(--r-sm)] px-2 py-1 text-[0.65rem] font-medium ring-1 ring-line">
                {k}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
