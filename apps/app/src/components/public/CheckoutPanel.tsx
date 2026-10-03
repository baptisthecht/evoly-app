"use client";

import { answerFor } from "@evoly/core";
import { QuestionField } from "./QuestionField";

import { formatMoney, type Locale } from "@evoly/i18n";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cancelReservationAction, changeSeatsAction, submitBuyerAction, type ReservationView } from "@/app/site/[sub]/[eventSlug]/actions";
import type { PublicSeatMap } from "@/server/seating";
import { SeatMapPicker } from "./SeatMapPicker";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import { PayButton, PaymentFields, StripePayment } from "./StripePayment";

const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com", "gmal.com": "gmail.com", "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmial.fr": "hotmail.fr", "outlok.com": "outlook.com", "outloo.com": "outlook.com",
  "yaho.com": "yahoo.com", "yahooo.fr": "yahoo.fr", "yaho.fr": "yahoo.fr", "icloud.co": "icloud.com", "iclod.com": "icloud.com", "skynet.bee": "skynet.be", "telenet.bee": "telenet.be",
};

/** Suggestion si le domaine ressemble à une faute de frappe courante (section 9.11, étape 3). */
export function emailSuggestion(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fix = DOMAIN_TYPOS[email.slice(at + 1).toLowerCase()];
  return fix ? `${email.slice(0, at)}@${fix}` : null;
}

interface Buyer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  marketingOptIn: boolean;
}

export function CheckoutPanel({ reservation, seatMap = null, organizationName, requirePhone, publishableKey, onCancel }: { reservation: ReservationView; seatMap?: PublicSeatMap | null; organizationName: string; requirePhone: boolean; publishableKey: string | null; onCancel: () => void }) {
  const t = useTranslations("checkout");
  const tp = useTranslations("public");
  const locale = useLocale() as Locale;
  const [left, setLeft] = useState(() => new Date(reservation.expiresAt).getTime() - Date.now());
  const [buyer, setBuyer] = useState<Buyer>({ firstName: "", lastName: "", email: "", phone: "", marketingOptIn: false });
  const [errors, setErrors] = useState<Partial<Record<keyof Buyer, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nominative = reservation.lines.filter((l) => l.nominative);
  const [holders, setHolders] = useState<Record<string, Array<{ firstName: string; lastName: string; email?: string }>>>(() => Object.fromEntries(nominative.map((l) => [l.orderItemId, Array.from({ length: l.quantity }, () => ({ firstName: "", lastName: "", ...(l.holderEmail ? { email: "" } : {}) }))])));
  const [holdersError, setHoldersError] = useState(false);
  // US-QST-01 : réponses aux questions de la commande et de chaque billet
  const questions = reservation.questions ?? { order: [], perLine: {} };
  const [answers, setAnswers] = useState<{ order: Record<string, unknown>; tickets: Record<string, Array<Record<string, unknown>>> }>(() => ({ order: {}, tickets: Object.fromEntries(reservation.lines.map((l) => [l.orderItemId, Array.from({ length: l.quantity }, () => ({}))])) }));
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const setOrderAnswer = (qid: string, v: unknown) => setAnswers((a) => ({ ...a, order: { ...a.order, [qid]: v } }));
  const setTicketAnswer = (item: string, i: number, qid: string, v: unknown) => setAnswers((a) => ({ ...a, tickets: { ...a.tickets, [item]: (a.tickets[item] ?? []).map((x, k) => (k === i ? { ...x, [qid]: v } : x)) } }));
  const answerMessage = (code: "REQUIRED" | "INVALID") => (code === "REQUIRED" ? t("required") : t("invalidAnswer"));
  const setHolder = (itemId: string, index: number, patch: Partial<{ firstName: string; lastName: string; email: string }>) =>
    setHolders((h) => ({ ...h, [itemId]: h[itemId]!.map((x, i) => (i === index ? { ...x, ...patch } : x)) }));
  useEffect(() => {
    const id = setInterval(() => setLeft(new Date(reservation.expiresAt).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [reservation.expiresAt]);
  const money = (v: number) => (v === 0 ? tp("free") : formatMoney(v, reservation.currency, locale, { trimZeroCents: true }));
  const ticketsHref = `/billets/${reservation.token}`;
  const suggestion = emailSuggestion(buyer.email);
  const set = (patch: Partial<Buyer>) => setBuyer((b) => ({ ...b, ...patch }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof Buyer, string>> = {};
    if (!buyer.firstName.trim()) e.firstName = t("required");
    if (!buyer.lastName.trim()) e.lastName = t("required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(buyer.email.trim())) e.email = t("invalidEmail");
    if (requirePhone && buyer.phone.trim().length < 6) e.phone = t("required");
    setErrors(e);
    const holdersOk = Object.values(holders).every((list) => list.every((h) => h.firstName.trim() && h.lastName.trim() && (h.email === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(h.email.trim()))));
    setHoldersError(!holdersOk);
    const ae: Record<string, string> = {};
    for (const q of questions.order) {
      const r = answerFor(q, answers.order[q.id]);
      if (!r.ok) ae[`o:${q.id}`] = answerMessage(r.code);
    }
    for (const l of reservation.lines)
      for (let i = 0; i < l.quantity; i++)
        for (const q of questions.perLine[l.orderItemId] ?? []) {
          const r = answerFor(q, answers.tickets[l.orderItemId]?.[i]?.[q.id]);
          if (!r.ok) ae[`t:${l.orderItemId}:${i}:${q.id}`] = answerMessage(r.code);
        }
    setAnswerErrors(ae);
    return Object.keys(e).length === 0 && holdersOk && Object.keys(ae).length === 0;
  };
  const payload = () => ({ firstName: buyer.firstName.trim(), lastName: buyer.lastName.trim(), email: buyer.email.trim(), phone: buyer.phone.trim() || null, marketingOptIn: buyer.marketingOptIn, holders, answers });
  const explain = (code: string) => (t.has(`error_${code}`) ? t(`error_${code}`) : t("error_UNKNOWN"));

  const confirmFree = async () => {
    if (!validate()) return;
    setBusy(true);
    setMessage(null);
    const res = await submitBuyerAction(reservation.token, payload());
    if (res.ok) return window.location.assign(ticketsHref);
    setMessage(explain(res.error));
    setBusy(false);
  };

  const pay = async (stripe: Stripe, elements: StripeElements) => {
    if (!validate()) return;
    setBusy(true);
    setMessage(null);
    const check = await elements.submit();
    if (check.error) {
      setMessage(check.error.message ?? t("error_UNKNOWN"));
      return setBusy(false);
    }
    const res = await submitBuyerAction(reservation.token, payload());
    if (!res.ok) {
      setMessage(explain(res.error));
      return setBusy(false);
    }
    if (res.data.kind === "PAID") return window.location.assign(ticketsHref);
    const { error } = await stripe.confirmPayment({
      elements,
      clientSecret: res.data.clientSecret,
      confirmParams: { return_url: `${window.location.origin}${ticketsHref}`, payment_method_data: { billing_details: { name: `${buyer.firstName} ${buyer.lastName}`.trim(), email: buyer.email.trim() } } },
      redirect: "if_required",
    });
    if (error) {
      // RG-BUY-06 : message clair, réservation et formulaire conservés
      setMessage(error.message ?? t("error_UNKNOWN"));
      return setBusy(false);
    }
    window.location.assign(ticketsHref);
  };

  if (left <= 0) {
    return (
      <div className="grid gap-4">
        <p className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning" role="alert">
          {t("expired")}
        </p>
        <Button type="button" variant="dark" size="lg" onClick={onCancel}>
          {t("restart")}
        </Button>
      </div>
    );
  }
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  const canPay = !reservation.isFree && publishableKey && reservation.stripeAccountId;
  const form = (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("firstName")} htmlFor="buyer-first" error={errors.firstName}>
          <Input id="buyer-first" autoComplete="given-name" value={buyer.firstName} onChange={(e) => set({ firstName: e.target.value })} invalid={!!errors.firstName} />
        </Field>
        <Field label={t("lastName")} htmlFor="buyer-last" error={errors.lastName}>
          <Input id="buyer-last" autoComplete="family-name" value={buyer.lastName} onChange={(e) => set({ lastName: e.target.value })} invalid={!!errors.lastName} />
        </Field>
      </div>
      <Field label={t("email")} htmlFor="buyer-email" hint={t("emailHint")} error={errors.email}>
        <Input id="buyer-email" type="email" inputMode="email" autoComplete="email" value={buyer.email} onChange={(e) => set({ email: e.target.value })} invalid={!!errors.email} />
      </Field>
      {suggestion ? (
        <button type="button" className="-mt-2 justify-self-start text-left text-sm underline underline-offset-4" onClick={() => set({ email: suggestion })}>
          {t("didYouMean", { email: suggestion })}
        </button>
      ) : null}
      {requirePhone ? (
        <Field label={t("phone")} htmlFor="buyer-phone" error={errors.phone}>
          <Input id="buyer-phone" type="tel" inputMode="tel" autoComplete="tel" value={buyer.phone} onChange={(e) => set({ phone: e.target.value })} invalid={!!errors.phone} />
        </Field>
      ) : null}
      {questions.order.length > 0 ? (
        <fieldset className="grid gap-4">
          <legend className="sr-only">{t("questionsTitle")}</legend>
          {questions.order.map((q) => (
            <QuestionField key={q.id} q={q} id={`q-${q.id}`} value={answers.order[q.id]} onChange={(v) => setOrderAnswer(q.id, v)} error={answerErrors[`o:${q.id}`]} />
          ))}
        </fieldset>
      ) : null}
      {reservation.lines.some((l) => (questions.perLine[l.orderItemId] ?? []).length > 0) ? (
        <fieldset className="grid gap-4 rounded-md bg-surface-sunken p-4">
          <legend className="sr-only">{t("ticketQuestionsTitle")}</legend>
          {reservation.lines.flatMap((l) =>
            (questions.perLine[l.orderItemId] ?? []).length === 0
              ? []
              : Array.from({ length: l.quantity }, (_, i) => (
                  <div key={`${l.orderItemId}-q-${i}`} className="grid gap-3">
                    <p className="text-sm font-semibold">{t("holderFor", { name: l.name, index: i + 1 })}</p>
                    {(questions.perLine[l.orderItemId] ?? []).map((q) => (
                      <QuestionField key={q.id} q={q} id={`q-${l.orderItemId}-${i}-${q.id}`} value={answers.tickets[l.orderItemId]?.[i]?.[q.id]} onChange={(v) => setTicketAnswer(l.orderItemId, i, q.id, v)} error={answerErrors[`t:${l.orderItemId}:${i}:${q.id}`]} />
                    ))}
                  </div>
                )),
          )}
        </fieldset>
      ) : null}
      {nominative.length > 0 ? (
        <fieldset className="grid gap-3 rounded-md bg-surface-sunken p-4">
          <legend className="sr-only">{t("holdersTitle")}</legend>
          <p className="font-semibold">{t("holdersTitle")}</p>
          <p className="-mt-2 text-sm text-ink-muted">{t("holdersHint")}</p>
          {nominative.map((l) =>
            holders[l.orderItemId]!.map((h, i) => (
              <div key={`${l.orderItemId}-${i}`} className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{t("holderFor", { name: l.name, index: i + 1 })}</p>
                  {l === nominative[0] && i === 0 ? (
                    <button type="button" className="text-sm underline underline-offset-4" onClick={() => setHolder(l.orderItemId, 0, { firstName: buyer.firstName, lastName: buyer.lastName, ...(l.holderEmail ? { email: buyer.email } : {}) })}>
                      {t("holderIsMe")}
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label={t("holderFirstName", { index: i + 1, name: l.name })} placeholder={t("firstName")} value={h.firstName} onChange={(e) => setHolder(l.orderItemId, i, { firstName: e.target.value })} />
                  <Input aria-label={t("holderLastName", { index: i + 1, name: l.name })} placeholder={t("lastName")} value={h.lastName} onChange={(e) => setHolder(l.orderItemId, i, { lastName: e.target.value })} />
                </div>
                {l.holderEmail ? <Input type="email" inputMode="email" aria-label={t("holderEmail", { index: i + 1, name: l.name })} placeholder={t("email")} value={h.email ?? ""} onChange={(e) => setHolder(l.orderItemId, i, { email: e.target.value })} /> : null}
              </div>
            )),
          )}
          {holdersError ? (
            <p role="alert" className="text-sm text-danger">
              {t("holdersRequired")}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--ink)]" checked={buyer.marketingOptIn} onChange={(e) => set({ marketingOptIn: e.target.checked })} />
        {t("marketing", { organization: organizationName })}
      </label>
      {canPay ? <PaymentFields /> : null}
      {message ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-ink-muted">{t.rich("terms", { organization: organizationName, sale: (c) => <a href={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://evoly.me"}/conditions-de-vente`} target="_blank" rel="noreferrer" className="underline underline-offset-4">{c}</a>, privacy: (c) => <a href={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://evoly.me"}/privacy`} target="_blank" rel="noreferrer" className="underline underline-offset-4">{c}</a> })}</p>
      {reservation.isFree ? (
        <Button type="button" size="lg" className="w-full" disabled={busy} aria-busy={busy} onClick={confirmFree}>
          {busy ? t("processing") : t("confirmFree")}
        </Button>
      ) : canPay ? (
        <PayButton label={busy ? t("processing") : t("pay", { amount: money(reservation.totalMinor) })} busy={busy} onPay={pay} />
      ) : (
        <p className="rounded-md bg-surface-sunken px-4 py-3 text-sm">{t("paymentsUnavailable")}</p>
      )}
    </div>
  );
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3 rounded-md bg-surface-accent px-4 py-3 text-sm">
        <span>{t("heldFor")}</span>
        <span className="font-display text-lg tabular-nums" aria-live="off">
          {minutes}:{String(seconds).padStart(2, "0")}
        </span>
      </div>
      {reservation.seats?.length ? <ReservedSeats token={reservation.token} lines={reservation.lines} initial={reservation.seats} seatMap={seatMap} /> : null}
      <ul className="grid gap-2">
        {reservation.lines.map((l, i) => (
          <li key={`${l.ticketTypeId}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              {l.quantity} × {l.name}
              {l.tierName ? <span className="text-ink-muted"> · {l.tierName}</span> : null}
            </span>
            <span className="font-semibold tabular-nums">{money(l.unitPriceMinor * l.quantity)}</span>
          </li>
        ))}
        {reservation.discountMinor > 0 && reservation.promoCode ? (
          <li className="flex items-baseline justify-between gap-3 text-sm text-ink-muted">
            <span>{t("promoLine", { code: reservation.promoCode })}</span>
            <span className="tabular-nums">−{formatMoney(reservation.discountMinor, reservation.currency, locale, { trimZeroCents: true })}</span>
          </li>
        ) : null}
        <li className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-semibold">{tp("total")}</span>
          <span className="font-display text-xl tabular-nums">{money(reservation.totalMinor)}</span>
        </li>
      </ul>
      {canPay ? (
        <StripePayment publishableKey={publishableKey!} stripeAccountId={reservation.stripeAccountId!} amountMinor={reservation.totalMinor} currency={reservation.currency} locale={locale}>
          {form}
        </StripePayment>
      ) : (
        form
      )}
      <button
        type="button"
        className="justify-self-center text-sm font-semibold underline underline-offset-4"
        onClick={async () => {
          await cancelReservationAction(reservation.token);
          onCancel();
        }}
      >
        {t("changeSelection")}
      </button>
    </div>
  );
}

/**
 * Section 9.9 : les meilleures places sont choisies automatiquement ; l'acheteur les voit en une ligne et peut, s'il
 * le souhaite, les voir sur le plan ou les changer (même réservation, même temps restant).
 */
function ReservedSeats({ token, lines, initial, seatMap }: { token: string; lines: ReservationView["lines"]; initial: NonNullable<ReservationView["seats"]>; seatMap: PublicSeatMap | null }) {
  const t = useTranslations("checkout");
  const [seats, setSeats] = useState(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(initial.map((s) => s.id));
  const [valid, setValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = new Map<string, string[]>();
  for (const s of seats) groups.set(s.row, [...(groups.get(s.row) ?? []), s.label]);
  const list = new Intl.ListFormat(useLocale(), { type: "conjunction" });
  const summary = [...groups].map(([row, labels]) => t("seatsRow", { row, count: labels.length, seats: list.format(labels) })).join(" · ");
  const needed: Record<string, number> = {};
  if (seatMap) for (const l of lines) { const c = seatMap.categories.find((x) => x.ticketTypeIds.includes(l.ticketTypeId)); if (c && !c.standing) needed[c.id] = (needed[c.id] ?? 0) + l.quantity; }
  const canChange = seatMap?.allowChoice ?? false;
  const complete = Object.values(needed).reduce((a, b) => a + b, 0) === draft.length;
  return (
    <div className="grid gap-2 rounded-md bg-surface-sunken px-4 py-3 text-sm">
      <p role="status"><strong>{t("seatsYours", { seats: summary })}</strong> {t("seatsAuto")}</p>
      {seatMap && !open ? (
        <button type="button" onClick={() => { setDraft(seats.map((s) => s.id)); setOpen(true); }} className="min-h-11 justify-self-start rounded-full px-4 font-semibold ring-1 ring-line-strong">{canChange ? t("seatsChange") : t("seatsView")}</button>
      ) : null}
      {seatMap && open ? (
        <div className="grid gap-3">
          <SeatMapPicker map={seatMap} needed={needed} chosen={draft} ownSeatIds={seats.map((s) => s.id)} fixedMode={canChange ? "map" : "view"} onChange={(ids, ok) => { setDraft(ids); setValid(ok); }} />
          {error ? <p role="alert" className="text-sm text-danger">{t.has(`error_${error}`) ? t(`error_${error}`) : t("error_UNKNOWN")}</p> : null}
          <div className="flex flex-wrap gap-2">
            {canChange ? (
              <button type="button" disabled={!complete || !valid || busy} onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await changeSeatsAction(token, draft);
                setBusy(false);
                if (!r.ok) return setError(r.error);
                setSeats(r.data);
                setOpen(false);
              }} className="min-h-11 rounded-full bg-surface-inverse px-5 font-semibold text-ink-inverse disabled:opacity-50">{busy ? t("processing") : t("seatsSave")}</button>
            ) : null}
            <button type="button" onClick={() => { setOpen(false); setError(null); }} className="min-h-11 rounded-full px-5 font-semibold ring-1 ring-line-strong">{canChange ? t("seatsCancel") : t("seatsClose")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

