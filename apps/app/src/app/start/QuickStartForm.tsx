"use client";

import { formatMoney } from "@evoly/i18n";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { quickStartAction } from "@/app/(auth)/actions";
import { FormError, SubmitButton, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AddressSearch } from "@/components/places/AddressSearch";
import { Field, Input } from "@/components/ui/Field";
import { CheckIcon } from "@/components/ui/icons";

const EVENT_FIELDS = ["title", "startsAtLocal", "locationName", "addressLine1", "postalCode", "city", "country", "price", "quantity"] as const;
const TYPES = ["ASSOCIATION", "COMPANY", "INDIVIDUAL", "PUBLIC_BODY"] as const;
interface Ev {
  title: string;
  date: string;
  time: string;
  locationName: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  country: string;
  price: string;
  quantity: string;
}
const empty: Ev = { title: "", date: "", time: "", locationName: "", addressLine1: "", postalCode: "", city: "", country: "", price: "", quantity: "" };
const slug = (s: string, fallback: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
type T = ReturnType<typeof useTranslations<"quickstart">>;

/** Étapes : la première cochée en vert une fois franchie. */
function Steps({ step, t }: { step: 1 | 2; t: T }) {
  const dot = "inline-flex size-5 items-center justify-center rounded-full text-[0.6875rem]";
  return (
    <ol className="flex items-center gap-3 text-[0.8125rem]" aria-label={t("title")}>
      <li
        className={step === 1 ? "inline-flex items-center gap-2 font-semibold" : "inline-flex items-center gap-2 font-medium text-success"}
        aria-current={step === 1 ? "step" : undefined}
      >
        <span className={step === 1 ? `${dot} bg-surface-inverse text-ink-inverse` : `${dot} bg-success text-blanc`}>
          {step === 1 ? "1" : <CheckIcon strokeWidth={3.4} />}
        </span>
        {t("stepEvent")}
      </li>
      <li aria-hidden="true" className={step === 1 ? "h-px w-8 bg-line-strong" : "h-px w-8 bg-success"} />
      <li
        className={step === 2 ? "inline-flex items-center gap-2 font-semibold" : "inline-flex items-center gap-2 text-ink-muted"}
        aria-current={step === 2 ? "step" : undefined}
      >
        <span className={step === 2 ? `${dot} bg-surface-inverse text-ink-inverse` : `${dot} ring-1 ring-line-strong`}>2</span>
        {t("stepAccount")}
      </li>
    </ol>
  );
}

/** Aperçu de la billetterie, mis à jour pendant la saisie. */
function Preview({ ev, t, locale, org, compact = false }: { ev: Ev; t: T; locale: string; org: string | null; compact?: boolean }) {
  const d = ev.date ? new Date(`${ev.date}T${ev.time || "00:00"}`) : null;
  const ok = !!d && !Number.isNaN(d.getTime());
  const when = ok ? new Intl.DateTimeFormat(locale, { dateStyle: "full", ...(ev.time ? { timeStyle: "short" } : {}) }).format(d!) : t("previewDate");
  const where = ev.locationName ? [ev.locationName, ev.addressLine1, ev.city].filter(Boolean).join(", ") : t("previewPlace");
  const n = parseInt(ev.quantity, 10);
  const p = Number(ev.price.replace(",", ".")) || 0;
  const price = p > 0 ? formatMoney(Math.round(p * 100), "EUR", locale as Parameters<typeof formatMoney>[2]) : t("free");
  const stamp = (
    <div className="shrink-0 rounded-md bg-surface-raised px-3 py-1.5 text-center shadow-sm">
      <div className="text-[0.6875rem] font-semibold text-[var(--required)] uppercase">
        {ok ? new Intl.DateTimeFormat(locale, { month: "short" }).format(d!).replace(".", "") : "-"}
      </div>
      <div className={compact ? "text-[1.0625rem] leading-tight font-semibold" : "text-[1.625rem] leading-tight font-semibold"}>{ok ? d!.getDate() : "-"}</div>
    </div>
  );
  if (compact)
    return (
      <div className="flex items-center gap-3 rounded-lg bg-surface-accent p-3 ring-1 ring-line" aria-label={t("preview")} role="region">
        {stamp}
        <div className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-semibold">{ev.title || t("previewTitle")}</span>
          <span className="truncate text-xs text-ink-muted">{where}</span>
        </div>
        <span className="text-[0.8125rem] font-semibold">{price}</span>
      </div>
    );
  return (
    <section aria-label={t("preview")} className="overflow-hidden rounded-lg bg-surface-raised shadow-lg ring-1 ring-line">
      <div className="flex items-center gap-1.5 border-b border-line px-3.5 py-2.5">
        {[0, 1, 2].map((i) => (
          <span key={i} aria-hidden="true" className="size-2 rounded-full bg-line" />
        ))}
        <span className="ml-2.5 min-w-0 flex-1 truncate rounded-sm bg-surface px-2.5 py-1 text-xs text-ink-muted">
          <span className="text-ink">{slug(org ?? "", "votre-asso")}</span>.evoly.me/<span className="text-ink">{slug(ev.title, "votre-evenement")}</span>
        </span>
      </div>
      <div className="flex items-center gap-4 bg-surface-accent px-7 pt-7 pb-6">
        {stamp}
        <div className="grid min-w-0 gap-1">
          {org !== null ? (
            <span className="justify-self-start rounded-sm bg-surface-raised px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-muted">{t("draft")}</span>
          ) : null}
          <h2 className={`text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] break-words ${ev.title ? "" : "text-ink-subtle"}`}>
            {ev.title || t("previewTitle")}
          </h2>
          <span className="text-[0.8125rem] text-ink-muted">{when}</span>
          <span className="text-[0.8125rem] text-ink-muted">{where}</span>
          {org ? <span className="text-[0.8125rem] text-ink-muted">{t("by", { name: org })}</span> : null}
        </div>
      </div>
      <div className="grid gap-3 px-7 pt-5 pb-6">
        <span className="text-xs font-semibold tracking-[0.05em] text-ink-muted uppercase">{t("tickets")}</span>
        <div className="flex items-stretch rounded-md ring-1 ring-line">
          <div className="grid flex-1 gap-0.5 px-4 py-3">
            <span className="font-medium">{t("ticket")}</span>
            <span className="text-xs text-ink-muted">{n > 0 ? t("places", { n }) : t("unlimited")}</span>
          </div>
          <div aria-hidden="true" className="my-2 border-l border-dashed border-line-strong" />
          <div className="flex items-center gap-3.5 px-4 py-3">
            <span className="text-[0.9375rem] font-semibold">{price}</span>
            <span className="inline-flex h-8 items-center rounded-sm bg-surface-inverse px-3.5 text-[0.8125rem] font-medium text-ink-inverse">{t("book")}</span>
          </div>
        </div>
        <span className="text-xs text-ink-muted">{t("secure")}</span>
      </div>
    </section>
  );
}

/**
 * Création rapide pour les visiteurs des annonces : l'événement d'abord, avec l'aperçu de sa billetterie qui se
 * construit en direct ; le compte ensuite. Prix vide : gratuit ; places vides : illimitées.
 */
export function QuickStartForm({ offer }: { offer: string | null }) {
  const t = useTranslations("quickstart");
  const locale = useLocale();
  const [state, action, pending] = useActionState(quickStartAction, null);
  const error = useFieldError(state);
  const [step, setStep] = useState<1 | 2>(1);
  const [ev, setEv] = useState<Ev>(empty);
  const [org, setOrg] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("ASSOCIATION");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const first = useRef<HTMLDivElement>(null);
  // une erreur sur un champ de l'événement ramène au premier écran
  useEffect(() => {
    if (state && !state.ok && state.fields && EVENT_FIELDS.some((f) => state.fields?.[f])) setStep(1);
  }, [state]);
  const set = (k: keyof Ev) => (e: React.ChangeEvent<HTMLInputElement>) => setEv((v) => ({ ...v, [k]: e.target.value }));
  const done = { title: !!ev.title.trim(), date: !!ev.date, time: !!ev.time, place: !!ev.locationName.trim() && !!ev.city.trim() };
  const filled = Object.values(done).filter(Boolean).length;
  const next = () => {
    const inputs = [...(first.current?.querySelectorAll("input") ?? [])];
    if (inputs.every((i) => i.reportValidity())) setStep(2);
  };
  const level = pass.length === 0 ? 0 : pass.length < 10 ? 1 : /[A-Z]/.test(pass) && /\d/.test(pass) && pass.length >= 12 ? 3 : 2;
  const bar = (i: number) => (level >= i ? (level === 1 ? "bg-warning" : "bg-success") : "bg-line");
  const columns = "grid items-start gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-12";
  return (
    <form action={action}>
      {step === 1 ? (
        <div className={columns}>
          <section className="grid gap-5">
            <Steps step={1} t={t} />
            <header className="grid gap-1.5">
              <h1 className="page-title">{t("title")}</h1>
              <p className="text-sm text-ink-muted">{t("lead")}</p>
            </header>
            <div className="lg:hidden">
              <Preview ev={ev} t={t} locale={locale} org={null} compact />
            </div>
            <Card className="grid gap-4">
              <div ref={first} className="grid gap-4">
                <Field label={t("eventTitle")} htmlFor="qs-title" required done={done.title} error={error("title")}>
                  <Input id="qs-title" required minLength={2} maxLength={120} placeholder={t("eventTitlePh")} value={ev.title} onChange={set("title")} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("date")} htmlFor="qs-date" required done={done.date} error={error("startsAtLocal")}>
                    <Input id="qs-date" type="date" required value={ev.date} onChange={set("date")} />
                  </Field>
                  <Field label={t("time")} htmlFor="qs-time" required done={done.time}>
                    <Input id="qs-time" type="time" required value={ev.time} onChange={set("time")} />
                  </Field>
                </div>
                <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
                  <Field label={t("place")} htmlFor="qs-place" required done={done.place} error={error("locationName")}>
                    <AddressSearch
                      id="qs-place"
                      required
                      maxLength={120}
                      placeholder={t("placePh")}
                      value={ev.locationName}
                      onChange={(e) => setEv((v) => ({ ...v, locationName: e.target.value, addressLine1: "", postalCode: "", country: "" }))}
                      onSelect={(p) =>
                        setEv((v) => ({
                          ...v,
                          locationName: p.name,
                          addressLine1: p.addressLine1,
                          postalCode: p.postalCode,
                          city: p.city || v.city,
                          country: p.country,
                        }))
                      }
                    />
                  </Field>
                  <Field label={t("city")} htmlFor="qs-city" required error={error("city")}>
                    <Input id="qs-city" required maxLength={80} value={ev.city} onChange={set("city")} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("price")} htmlFor="qs-price" optional={t("optional")} error={error("price")}>
                    <Input
                      id="qs-price"
                      inputMode="decimal"
                      pattern="\d{1,6}([.,]\d{1,2})?"
                      placeholder={t("pricePh")}
                      value={ev.price}
                      onChange={set("price")}
                    />
                  </Field>
                  <Field label={t("quantity")} htmlFor="qs-quantity" optional={t("optional")} error={error("quantity")}>
                    <Input id="qs-quantity" type="number" min={1} max={100000} placeholder={t("quantityPh")} value={ev.quantity} onChange={set("quantity")} />
                  </Field>
                </div>
              </div>
              <p className="-mt-1 text-xs text-ink-muted">{t("emptyHint")}</p>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                <div className="grid min-w-44 flex-1 gap-1.5">
                  <span className={filled === 4 ? "text-xs font-medium text-success" : "text-xs font-medium text-ink-muted"}>
                    {filled === 4 ? t("ready") : t("progress", { n: filled })}
                  </span>
                  <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${filled * 25}%` }} />
                  </div>
                </div>
                <Button type="button" onClick={next}>
                  {t("next")}
                </Button>
              </div>
            </Card>
            <p className="text-xs text-ink-muted">
              <span aria-hidden="true" className="text-[var(--required)]">
                *
              </span>{" "}
              {t("required")}
            </p>
          </section>
          <aside className="hidden gap-3 lg:sticky lg:top-6 lg:grid">
            <p className="flex items-center justify-between text-[0.8125rem] font-medium">{t("preview")}</p>
            <Preview ev={ev} t={t} locale={locale} org={null} />
          </aside>
        </div>
      ) : (
        <div className={columns}>
          <section className="grid gap-5">
            {EVENT_FIELDS.map((k) => (
              <input key={k} type="hidden" name={k} value={k === "startsAtLocal" ? `${ev.date}T${ev.time}` : ev[k]} />
            ))}
            <input type="hidden" name="type" value={type} />
            <Steps step={2} t={t} />
            <header className="grid gap-1.5">
              <h1 className="page-title">{t("accountTitle")}</h1>
              <p className="text-sm text-ink-muted">{t("accountLead")}</p>
            </header>
            {offer ? (
              <p role="note" className="rounded-md bg-success-soft px-3.5 py-3 text-[0.8125rem] text-ink ring-1 ring-success/25">
                {offer}
              </p>
            ) : null}
            <Card className="grid gap-4">
              <Field label={t("orgName")} htmlFor="qs-org" required done={org.trim().length >= 2} error={error("orgName")}>
                <Input
                  id="qs-org"
                  name="orgName"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="organization"
                  placeholder={t("orgNamePh")}
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                />
              </Field>
              <fieldset className="grid gap-1.5">
                <legend className="mb-1.5 text-[0.8125rem] font-medium">{t("type")}</legend>
                <div className="grid grid-cols-2 overflow-hidden rounded-md ring-1 ring-line-strong sm:grid-cols-4">
                  {TYPES.map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={type === k}
                      onClick={() => setType(k)}
                      className={
                        type === k
                          ? "min-h-11 bg-surface-inverse px-2 text-[0.8125rem] font-medium text-ink-inverse"
                          : "min-h-11 bg-surface-raised px-2 text-[0.8125rem] font-medium text-ink"
                      }
                    >
                      {t(`type_${k}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label={t("email")} htmlFor="qs-email" required error={error("email")}>
                <Input id="qs-email" name="email" type="email" required autoComplete="email" />
              </Field>
              <Field label={t("password")} htmlFor="qs-password" required done={level >= 2} error={error("password")}>
                <div className="relative">
                  <Input
                    id="qs-password"
                    name="password"
                    type={show ? "text" : "password"}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    placeholder={t("passwordPh")}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="pr-24"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute top-1 right-1 h-9 rounded-sm px-3 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"
                  >
                    {show ? t("hide") : t("show")}
                  </button>
                </div>
              </Field>
              <div aria-hidden="true" className="-mt-2 grid grid-cols-3 gap-1">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={`h-[3px] rounded-full ${bar(i)}`} />
                ))}
              </div>
              <span className={level >= 2 ? "-mt-2 text-xs text-success" : "-mt-2 text-xs text-ink-muted"}>{t(`strength${level}`)}</span>
              <label className="flex items-start gap-2.5 text-[0.8125rem] text-ink-muted">
                <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--ink)]" />
                <span>
                  {t("terms")}{" "}
                  <span aria-hidden="true" className="text-[var(--required)]">
                    *
                  </span>
                </span>
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
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                <button type="button" className="text-[0.8125rem] text-ink-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setStep(1)}>
                  {t("back")}
                </button>
                <SubmitButton pending={pending}>{t("submit")}</SubmitButton>
              </div>
            </Card>
          </section>
          <aside className="grid gap-4 lg:sticky lg:top-6">
            <Preview ev={ev} t={t} locale={locale} org={org.trim() || "votre organisation"} />
            <div className="grid gap-3 rounded-lg bg-surface-raised p-5 ring-1 ring-line">
              <span className="text-[0.8125rem] font-semibold">{t("nextTitle")}</span>
              <span className="flex items-center gap-2.5 text-[0.8125rem] font-medium text-success">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-success text-[0.6875rem] text-blanc">
                  <CheckIcon strokeWidth={3.4} />
                </span>
                {t("next1")}
              </span>
              <span className="flex items-center gap-2.5 text-[0.8125rem]">
                <span className="inline-flex size-5 items-center justify-center rounded-full text-[0.6875rem] ring-1 ring-line-strong">2</span>
                {t("next2")}
              </span>
              <span className="flex items-center gap-2.5 text-[0.8125rem]">
                <span className="inline-flex size-5 items-center justify-center rounded-full text-[0.6875rem] ring-1 ring-line-strong">3</span>
                {t("next3")}
              </span>
            </div>
          </aside>
        </div>
      )}
    </form>
  );
}
