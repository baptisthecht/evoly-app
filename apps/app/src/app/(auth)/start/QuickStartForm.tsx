"use client";

import { formatMoney } from "@evoly/i18n";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { quickStartAction } from "../actions";
import { FormError, SubmitButton, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";

const EVENT_FIELDS = ["title", "startsAtLocal", "locationName", "city", "price", "quantity"] as const;
type EventValues = Record<(typeof EVENT_FIELDS)[number], string>;
const empty: EventValues = { title: "", startsAtLocal: "", locationName: "", city: "", price: "", quantity: "" };

/** Deux écrans : l'événement, puis le compte avec l'aperçu de l'événement déjà prêt. */
export function QuickStartForm() {
  const t = useTranslations("quickstart");
  const locale = useLocale();
  const [state, action, pending] = useActionState(quickStartAction, null);
  const error = useFieldError(state);
  const [step, setStep] = useState<1 | 2>(1);
  const [ev, setEv] = useState<EventValues>(empty);
  const first = useRef<HTMLDivElement>(null);
  // une erreur sur un champ de l'événement ramène au premier écran
  useEffect(() => {
    if (state && !state.ok && state.fields && EVENT_FIELDS.some((f) => state.fields?.[f])) setStep(1);
  }, [state]);
  const set = (k: keyof EventValues) => (e: React.ChangeEvent<HTMLInputElement>) => setEv((v) => ({ ...v, [k]: e.target.value }));
  const next = () => {
    const inputs = [...(first.current?.querySelectorAll("input") ?? [])];
    if (inputs.every((i) => i.reportValidity())) setStep(2);
  };
  const price = Number(ev.price.replace(",", ".")) || 0;
  const when = ev.startsAtLocal ? new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(new Date(ev.startsAtLocal)) : "";
  return (
    <form action={action} className="grid gap-5" noValidate={false}>
      {step === 1 ? (
        <div ref={first} className="grid gap-4">
          <Field label={t("eventTitle")} htmlFor="qs-title" error={error("title")}>
            <Input id="qs-title" required minLength={2} maxLength={120} placeholder={t("eventTitlePh")} value={ev.title} onChange={set("title")} />
          </Field>
          <Field label={t("startsAt")} htmlFor="qs-starts" error={error("startsAtLocal")}>
            <Input id="qs-starts" type="datetime-local" required value={ev.startsAtLocal} onChange={set("startsAtLocal")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("place")} htmlFor="qs-place" error={error("locationName")}>
              <Input id="qs-place" required maxLength={120} placeholder={t("placePh")} value={ev.locationName} onChange={set("locationName")} />
            </Field>
            <Field label={t("city")} htmlFor="qs-city" error={error("city")}>
              <Input id="qs-city" required maxLength={80} value={ev.city} onChange={set("city")} />
            </Field>
            <Field label={t("price")} htmlFor="qs-price" hint={t("priceHint")} error={error("price")}>
              <Input id="qs-price" required inputMode="decimal" pattern="\d{1,6}([.,]\d{1,2})?" value={ev.price} onChange={set("price")} />
            </Field>
            <Field label={t("quantity")} htmlFor="qs-quantity" error={error("quantity")}>
              <Input id="qs-quantity" type="number" required min={1} max={100000} value={ev.quantity} onChange={set("quantity")} />
            </Field>
          </div>
          <Button type="button" size="lg" onClick={next}>
            {t("next")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {EVENT_FIELDS.map((k) => (
            <input key={k} type="hidden" name={k} value={ev[k]} />
          ))}
          <section aria-label={t("almost")} className="grid gap-1 rounded-[var(--r-card)] bg-surface-raised p-4 ring-1 ring-line">
            <h2 className="font-display text-lg">{t("almost")}</h2>
            <p className="text-sm text-ink-muted">{t("almostLead")}</p>
            <p className="mt-2 font-semibold">{ev.title}</p>
            <p className="text-sm">{when}</p>
            <p className="text-sm">
              {ev.locationName}, {ev.city}
            </p>
            <p className="text-sm">
              {price > 0 ? formatMoney(Math.round(price * 100), "EUR", locale as Parameters<typeof formatMoney>[2]) : t("free")} ·{" "}
              {t("places", { n: ev.quantity })}
            </p>
            <button type="button" className="justify-self-start text-sm underline" onClick={() => setStep(1)}>
              {t("back")}
            </button>
          </section>
          <Field label={t("orgName")} htmlFor="qs-org" error={error("orgName")}>
            <Input id="qs-org" name="orgName" required minLength={2} maxLength={80} placeholder={t("orgNamePh")} autoComplete="organization" />
          </Field>
          <Field label={t("type")} htmlFor="qs-type">
            <Select id="qs-type" name="type" defaultValue="ASSOCIATION">
              {(["ASSOCIATION", "COMPANY", "INDIVIDUAL", "PUBLIC_BODY"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`type_${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("email")} htmlFor="qs-email" error={error("email")}>
            <Input id="qs-email" name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label={t("password")} htmlFor="qs-password" hint={t("passwordHint")} error={error("password")}>
            <Input id="qs-password" name="password" type="password" required minLength={10} autoComplete="new-password" />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="terms" required className="mt-1" />
            <span>{t("terms")}</span>
          </label>
          {state && !state.ok && state.error === "EMAIL_TAKEN" ? (
            <p role="alert" className="text-sm text-danger">
              {t("emailTaken")}{" "}
              <Link href="/login" className="underline">
                {t("login")}
              </Link>
            </p>
          ) : (
            <FormError state={state} />
          )}
          <SubmitButton pending={pending}>{t("submit")}</SubmitButton>
        </div>
      )}
    </form>
  );
}
