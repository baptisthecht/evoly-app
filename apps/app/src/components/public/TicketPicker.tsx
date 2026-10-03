"use client";

import type { PublicSeatMap } from "@/server/seating";
import { SeatMapPicker } from "./SeatMapPicker";

import { formatMoney, type Locale } from "@evoly/i18n";
import { availabilityDisplay, unitDiscount } from "@evoly/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { friendSeatsAction, previewPromoAction, reserveAction, type PromoPreview, type ReservationView } from "@/app/site/[sub]/[eventSlug]/actions";
import { Input } from "../ui/Field";
import { Button } from "../ui/Button";
import { CheckoutPanel } from "./CheckoutPanel";
import { cn } from "../ui/cn";

export interface PickerTicket {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  tierName: string | null;
  next: { priceMinor: number; startsAt: string } | null;
  remaining: number;
  quantity: number | null;
  minPerOrder: number;
  maxPerOrder: number;
  onSale: boolean;
}

/** Choix des billets (US-PUB-02). Les prix affichés sont les prix finaux (RG-PUB-03). */
export function TicketPicker({ tickets: baseTickets, currency, timeZone, maxPerOrder, state, checkout, seatMap = null }: { tickets: PickerTicket[]; currency: string; timeZone: string; maxPerOrder: number; state: "OPEN" | "NOT_STARTED" | "PAUSED" | "CLOSED" | "PREVIEW"; checkout?: { eventId: string; organizationName: string; requirePhone: boolean; publishableKey: string | null }; seatMap?: PublicSeatMap | null }) {
  const t = useTranslations("public");
  const locale = useLocale() as Locale;
  const tc = useTranslations("checkout");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const tseat = useTranslations("seatPicker");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const tickets = useMemo(() => [...baseTickets, ...(promo?.unlocked ?? []).filter((u) => !baseTickets.some((b) => b.id === u.id))], [baseTickets, promo]);
  const discounted = (tt: PickerTicket) =>
    promo && (promo.ticketTypeIds.length === 0 || promo.ticketTypeIds.includes(tt.id))
      ? tt.priceMinor - unitDiscount(tt.priceMinor, { id: "", eventId: "", code: promo.code, discountType: promo.discountType, percentOffBps: promo.percentOffBps, amountOffMinor: promo.amountOffMinor, ticketTypeIds: promo.ticketTypeIds, usedCount: 0, isActive: true })
      : tt.priceMinor;
  const applyPromo = async () => {
    if (!checkout || !promoInput.trim()) return;
    setPromoError(null);
    const res = await previewPromoAction(checkout.eventId, promoInput);
    if (res.ok) {
      setPromo(res.data);
      setPromoOpen(false);
    } else setPromoError(tc.has(`error_${res.error}`) ? tc(`error_${res.error}`) : tc("error_PROMO_NOT_FOUND"));
  };
  // tout est complet : ni code promo ni total, la section Revente prend le relais (RG-EVT-04)
  const allSoldOut = tickets.length > 0 && tickets.every((tt) => tt.remaining <= 0);
  const total = tickets.reduce((n, tt) => n + (qty[tt.id] ?? 0) * discounted(tt), 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const money = (v: number) => (v === 0 ? t("free") : formatMoney(v, currency, locale, { trimZeroCents: true }));
  const set = (tt: PickerTicket, next: number) => {
    const others = count - (qty[tt.id] ?? 0);
    const cap = Math.min(tt.maxPerOrder, Number.isFinite(tt.remaining) ? tt.remaining : tt.maxPerOrder, maxPerOrder - others);
    let v = Math.max(0, Math.min(next, cap));
    if (v > 0 && v < tt.minPerOrder) v = next > (qty[tt.id] ?? 0) ? Math.min(tt.minPerOrder, cap) : 0;
    setQty((q) => ({ ...q, [tt.id]: v }));
  };
  // section 9.9 : places à choisir par catégorie, d'après les billets sélectionnés
  const [seatStep, setSeatStep] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [seatValid, setSeatValid] = useState(true);
  // « à côté de mes amis » : lien partagé (?amis=…), places de l'ami et meilleures places proches des siennes
  const [friend, setFriend] = useState<{ code: string; firstName: string; seatIds: string[]; center: { x: number; y: number } } | null>(null);
  useEffect(() => {
    if (!checkout) return;
    const code = new URLSearchParams(window.location.search).get("amis");
    if (code) void friendSeatsAction(checkout.eventId, code).then((f) => f && setFriend({ code, ...f }));
  }, [checkout]);
  const needed: Record<string, number> = {};
  // fosse, zone debout : billets sans place, pas de choix sur le plan
  if (seatMap) for (const [ticketTypeId, n] of Object.entries(qty)) { const c = seatMap.categories.find((x) => x.ticketTypeIds.includes(ticketTypeId)); if (c && !c.standing && n > 0) needed[c.id] = (needed[c.id] ?? 0) + n; }
  const needsSeats = Object.keys(needed).length > 0;
  const seatsComplete = Object.values(needed).reduce((a, b) => a + b, 0) === chosen.length;
  const reserve = async () => {
    if (!checkout || count === 0) return;
    if (seatMap && needsSeats && !seatStep) {
      setChosen([]);
      return setSeatStep(true);
    }
    setPending(true);
    setError(null);
    const lines = Object.entries(qty).filter(([, n]) => n > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const res = await reserveAction(checkout.eventId, lines, promo?.code ?? null, seatMap && needsSeats ? chosen : null, friend?.code ?? null);
    setPending(false);
    if (res.ok) return setReservation(res.data);
    setError(tc.has(`error_${res.error}`) ? tc(`error_${res.error}`) : tc("error_UNKNOWN"));
  };
  if (seatStep && seatMap && needsSeats && checkout && !reservation)
    return (
      <div className="grid gap-4">
        <p className="font-semibold">{tseat("title")}</p>
        <SeatMapPicker map={seatMap} needed={needed} chosen={chosen} friend={friend} onChange={(ids, valid) => { setChosen(ids); setSeatValid(valid); }} />
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="h-12 rounded-full px-5 font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]" onClick={() => setSeatStep(false)}>
            {tseat("back")}
          </button>
          <button type="button" disabled={!seatsComplete || !seatValid || pending} className="h-12 flex-1 rounded-full bg-surface-inverse px-5 font-semibold text-ink-inverse disabled:opacity-50" onClick={reserve}>
            {pending ? tc("processing") : tseat("reserve")}
          </button>
        </div>
      </div>
    );
  if (reservation && checkout) {
    return <CheckoutPanel reservation={reservation} organizationName={checkout.organizationName} requirePhone={checkout.requirePhone} publishableKey={checkout.publishableKey} onCancel={() => { setReservation(null); setQty({}); }} />;
  }
  return (
    <div className="grid gap-4">
      {friend ? <p role="status" className="rounded-md bg-lilas/50 px-4 py-3 text-sm">{tseat("friendBanner", { name: friend.firstName })}</p> : null}
      <ul className="grid gap-3">
        {tickets.map((tt) => {
          const availability = availabilityDisplay(tt.remaining, tt.quantity);
          const n = qty[tt.id] ?? 0;
          const selectable = tt.onSale && (state === "OPEN" || state === "PREVIEW");
          return (
            <li key={tt.id} className={cn("grid gap-3 rounded-lg p-4 ring-1 ring-line", availability.kind === "SOLD_OUT" ? "bg-surface-sunken" : "bg-surface-raised")}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <p className="font-semibold">{tt.name}</p>
                  {tt.description ? <p className="text-sm text-ink-muted">{tt.description}</p> : null}
                  <div className="flex flex-wrap gap-2 text-sm">
                    {tt.tierName ? <span className="rounded-full bg-surface-accent px-2 py-0.5 font-label text-xs font-bold">{tt.tierName}</span> : null}
                    {availability.kind === "FEW_LEFT" ? <span className="font-semibold text-warning">{t("fewLeft", { count: availability.remaining })}</span> : null}
                    {availability.kind === "SOLD_OUT" ? <span className="font-semibold text-ink-muted">{t("soldOut")}</span> : null}
                  </div>
                  {tt.next ? (
                    <p className="text-xs text-ink-muted">
                      {t("nextTier", { price: money(tt.next.priceMinor), date: new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "long" }).format(new Date(tt.next.startsAt)) })}
                    </p>
                  ) : null}
                </div>
                <p className="grid shrink-0 justify-items-end font-display text-xl tracking-[-0.03em] tabular-nums">
                  {discounted(tt) !== tt.priceMinor ? (
                    <>
                      <span className="font-sans text-sm font-normal text-ink-muted line-through">{money(tt.priceMinor)}</span>
                      <span>{money(discounted(tt))}</span>
                    </>
                  ) : (
                    money(tt.priceMinor)
                  )}
                </p>
              </div>
              {selectable ? (
                <div className="flex items-center justify-end gap-2" role="group" aria-label={t("quantityFor", { name: tt.name })}>
                  <Button type="button" variant="secondary" size="sm" className="size-10 px-0 text-lg" onClick={() => set(tt, n - 1)} disabled={n === 0} aria-label={t("less", { name: tt.name })}>
                    −
                  </Button>
                  <output className="w-8 text-center font-display text-lg tabular-nums" aria-live="polite">
                    {n}
                  </output>
                  <Button type="button" variant="dark" size="sm" className="size-10 px-0 text-lg" onClick={() => set(tt, n + 1)} aria-label={t("more", { name: tt.name })}>
                    +
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {state === "OPEN" && checkout && (!allSoldOut || promo) ? (
        promo ? (
          <p className="flex items-center justify-between gap-3 rounded-md bg-surface-accent px-4 py-2.5 text-sm">
            <span>{tc("promoApplied", { code: promo.code })}</span>
            <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setPromo(null)}>
              {tc("promoRemove")}
            </button>
          </p>
        ) : promoOpen ? (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input aria-label={tc("promoLabel")} placeholder={tc("promoLabel")} value={promoInput} onChange={(e) => setPromoInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyPromo()} className="uppercase" autoCapitalize="characters" />
              <Button type="button" variant="dark" onClick={applyPromo}>
                {tc("promoApply")}
              </Button>
            </div>
            {promoError ? (
              <p role="alert" className="text-sm text-danger">
                {promoError}
              </p>
            ) : null}
          </div>
        ) : (
          <button type="button" className="justify-self-start text-sm font-semibold underline underline-offset-4" onClick={() => setPromoOpen(true)}>
            {tc("promoToggle")}
          </button>
        )
      ) : null}
      {allSoldOut && !promo ? null : state === "OPEN" || state === "PREVIEW" ? (
        <div className="grid gap-3 border-t border-line pt-4">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">{t("total")}</span>
            <span className="font-display text-2xl tracking-[-0.03em] tabular-nums">{count === 0 ? "—" : money(total)}</span>
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="button" size="lg" disabled={state !== "OPEN" || !checkout || count === 0 || pending} aria-busy={pending} className="w-full" onClick={reserve}>
            {pending ? tc("processing") : t("continue")}
          </Button>
          {state === "PREVIEW" ? <p className="text-center text-xs text-ink-muted">{t("previewNoPurchase")}</p> : null}
        </div>
      ) : (
        <p className="rounded-md bg-surface-sunken px-4 py-3 text-sm">{t(`salesState_${state}`)}</p>
      )}
    </div>
  );
}
