"use client";

import { slugify } from "@evoly/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { LAUNCH_COUNTRIES } from "@/lib/countries";
import { checkSubdomainAction, createOrganizationAction } from "./actions";

type Availability = "idle" | "checking" | "available" | "LENGTH" | "FORMAT" | "RESERVED" | "TAKEN" | "RATE_LIMITED";

export function OrganizationForm({ baseDomain, siteUrl }: { baseDomain: string; siteUrl: string }) {
  const t = useTranslations("onboarding");
  const tv = useTranslations("validation");
  const locale = useLocale() as "fr" | "en";
  const { state, pending, formProps } = useActionForm(createOrganizationAction, null);
  const fieldError = useFieldError(state);
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [touched, setTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
  const seq = useRef(0);

  useEffect(() => {
    if (!touched) setSubdomain(slugify(name));
  }, [name, touched]);

  useEffect(() => {
    if (!subdomain) return setAvailability("idle");
    const id = ++seq.current;
    setAvailability("checking");
    const timer = setTimeout(async () => {
      const r = await checkSubdomainAction(subdomain);
      if (id === seq.current) setAvailability(r.ok ? "available" : r.reason);
    }, 400);
    return () => clearTimeout(timer);
  }, [subdomain]);

  const subError = fieldError("subdomain") ?? (["LENGTH", "FORMAT", "RESERVED", "TAKEN"].includes(availability) ? tv(`SUBDOMAIN_${availability}`) : null);

  return (
    <form {...formProps} className="grid gap-6" noValidate>
      <FormError state={state} />
      <Field label={t("organizationName")} htmlFor="name" error={fieldError("name")}>
        <Input id="name" name="name" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} required invalid={!!fieldError("name")} />
      </Field>

      <Field
        label={t("pageAddress")}
        htmlFor="subdomain"
        error={subError}
        hint={availability === "available" ? <span className="text-success">{t("addressAvailable")}</span> : availability === "checking" ? t("checking") : t("pageAddressHint")}
      >
        <div className="flex items-stretch overflow-hidden rounded-md shadow-[inset_0_0_0_1.5px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_2px_var(--ink)]">
          <input
            id="subdomain"
            name="subdomain"
            value={subdomain}
            onChange={(e) => {
              setTouched(true);
              setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!subError || undefined}
            className="h-12 min-w-0 flex-1 bg-surface-raised px-4 text-base outline-none"
            required
          />
          <span className="flex items-center bg-surface-sunken px-3 text-sm text-ink-muted">.{baseDomain}</span>
        </div>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("country")} htmlFor="country" error={fieldError("country")}>
          <Select id="country" name="country" defaultValue="BE">
            {LAUNCH_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name[locale]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 font-label text-[0.8rem] font-bold">{t("type")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["ASSOCIATION", "COMPANY", "INDIVIDUAL", "PUBLIC_BODY"] as const).map((v, i) => (
              <label key={v} className={cn("flex h-11 cursor-pointer items-center justify-center rounded-md px-2 text-center text-sm font-medium shadow-[inset_0_0_0_1.5px_var(--line-strong)]", "has-[:checked]:bg-surface-inverse has-[:checked]:text-ink-inverse has-[:checked]:shadow-none")}>
                <input type="radio" name="type" value={v} defaultChecked={i === 0} className="sr-only" />
                {t(`type_${v}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="flex items-start gap-3 text-sm text-ink-muted">
        <input type="checkbox" name="terms" className="mt-0.5 size-5 accent-[var(--ink)]" required />
        <span>
          {t.rich("terms", {
            cgu: (chunks) => (
              <a href={`${siteUrl}/cgu`} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
                {chunks}
              </a>
            ),
                dpa: (chunks) => (
                  <a href={`${siteUrl}/sous-traitance`} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
                    {chunks}
                  </a>
                ),
          })}
        </span>
      </label>
      {fieldError("terms") ? <p className="-mt-4 text-sm text-danger">{fieldError("terms")}</p> : null}

      <SubmitButton pending={pending}>{t("createOrganization")}</SubmitButton>
    </form>
  );
}
