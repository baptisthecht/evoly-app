"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements, ExpressCheckoutElement } from "@stripe/react-stripe-js";
import { validatePromoCodeAction, createFreeOrderAction, createPaymentIntentAction } from "@/actions/checkout";
import { SeatPicker, type SeatingMapData } from "./SeatPicker";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketType {
  id: string; name: string; priceCents: number;
  quantity: number | null; quantitySold: number;
  maxPerOrder: number; minPerOrder: number;
  isNominative: boolean;
  saleStartsAt: string | null; saleEndsAt: string | null;
  seatingCategoryId: string | null;
}
interface EventData {
  id: string; title: string;
  primaryColor?: string | null;
  allowSeatChoice?: boolean;
  organization: { stripeAccountStatus: string };
  ticketTypes: TicketType[];
}
interface CartItem { ticketTypeId: string; quantity: number; ticketType: TicketType; }
interface PromoResult { id: string; code: string; type: string; value: number; ticketTypeIds: string[]; }
interface HolderData { [ticketTypeId: string]: Array<{ firstName: string; lastName: string; email: string; }>; }

// ─── Main component ───────────────────────────────────────────────────────────

export function CheckoutFlow({
  event, quantities, onQuantityChange, onBack, onSuccess, primaryColor: brandPrimary,
  seatingMap,
}: {
  event: EventData;
  quantities: Record<string, number>;
  onQuantityChange: (q: Record<string, number>) => void;
  onBack: () => void;
  onSuccess: (orderId: string, magicToken: string) => void;
  primaryColor?: string;
  seatingMap?: SeatingMapData | null;
}) {
  const primaryColor = brandPrimary ?? event.primaryColor ?? "#7c3aed";
  const now = new Date();
  const availableTickets = event.ticketTypes.filter((tt) => {
    if (tt.saleStartsAt && new Date(tt.saleStartsAt) > now) return false;
    if (tt.saleEndsAt && new Date(tt.saleEndsAt) < now) return false;
    if (tt.quantity !== null && tt.quantitySold >= tt.quantity) return false;
    return true;
  });

  const cartItems: CartItem[] = availableTickets
    .filter((tt) => (quantities[tt.id] ?? 0) > 0)
    .map((tt) => ({ ticketTypeId: tt.id, quantity: quantities[tt.id]!, ticketType: tt }));
  const totalItems = cartItems.reduce((a, i) => a + i.quantity, 0);

  // ── Seat selection state ──
  const needsSeatPicker = !!(
    event.allowSeatChoice &&
    seatingMap &&
    cartItems.some((i) => i.ticketType.seatingCategoryId)
  );

  // Required seats per ticket type
  const requiredByType: Record<string, number> = {};
  for (const item of cartItems) {
    if (item.ticketType.seatingCategoryId) {
      requiredByType[item.ticketTypeId] = item.quantity;
    }
  }

  const [selectedSeatsByType, setSelectedSeatsByType] = useState<Record<string, string[]>>({});
  const [seatStepDone, setSeatStepDone] = useState(false);

  // When cart changes, reset seat selection if needed
  useEffect(() => {
    setSelectedSeatsByType({});
    setSeatStepDone(false);
  }, [JSON.stringify(quantities)]);

  // Seat selection complete?
  const totalRequired = Object.values(requiredByType).reduce((a, b) => a + b, 0);
  const totalSeatsSelected = Object.values(selectedSeatsByType).reduce((a, b) => a + b.length, 0);
  const seatsComplete = totalSeatsSelected === totalRequired;

  // ── Buyer info state ──
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [holderData, setHolderData] = useState<HolderData>({});
  const [promoInput, setPromoInput] = useState("");
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Stripe state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loadingPI, setLoadingPI] = useState(false);

  function getDiscountedPrice(tt: TicketType): number {
    if (!promoResult) return tt.priceCents;
    if (promoResult.ticketTypeIds.length > 0 && !promoResult.ticketTypeIds.includes(tt.id)) return tt.priceCents;
    if (promoResult.type === "PERCENTAGE") return Math.round(tt.priceCents * (1 - promoResult.value / 100));
    if (promoResult.type === "FIXED") return Math.max(0, tt.priceCents - promoResult.value);
    if (promoResult.type === "FREE") return 0;
    return tt.priceCents;
  }

  const subtotal = cartItems.reduce((acc, i) => acc + i.ticketType.priceCents * i.quantity, 0);
  const discountedSubtotal = cartItems.reduce((acc, i) => acc + getDiscountedPrice(i.ticketType) * i.quantity, 0);
  const discount = subtotal - discountedSubtotal;
  const isFreeOrder = discountedSubtotal === 0;
  const commissionRate = 0.05;
  const estimatedFees = isFreeOrder ? 0 : Math.round(discountedSubtotal * commissionRate);
  const total = discountedSubtotal;

  const hasNominative = cartItems.some((i) => i.ticketType.isNominative);
  const buyerInfoFilled = firstName.trim() && lastName.trim() && email.trim() && email.includes("@");
  const emailValid = /^[^@]+@[^@]+\.[^@]{2,}$/.test(email.trim());
  const buyerInfoComplete = !!(firstName.trim() && lastName.trim() && emailValid);

  // Only show buyer info after seat step (if applicable)
  const showBuyerSection = totalItems > 0 && (!needsSeatPicker || seatStepDone);
  const showPaymentSection = showBuyerSection && buyerInfoFilled;

  const piCreating = useRef(false);
  useEffect(() => {
    if (!buyerInfoComplete || !showPaymentSection || isFreeOrder) return;
    if (clientSecret) return;
    if (piCreating.current) return;
    piCreating.current = true;
    setLoadingPI(true);

    const payload = {
      eventId: event.id,
      buyerEmail: email,
      buyerFirstName: firstName,
      buyerLastName: lastName,
      buyerPhone: phone || null,
      promoCodeId: promoResult?.id ?? null,
      items: cartItems.map((item) => ({
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        holderData: item.ticketType.isNominative ? (holderData[item.ticketTypeId] ?? []) : undefined,
        seatIds: selectedSeatsByType[item.ticketTypeId] ?? [],
      })),
    };
    createPaymentIntentAction(payload).then((result) => {
      setLoadingPI(false);
      piCreating.current = false;
      if ("error" in result && result.error) { setError(result.error as string); return; }
      if (result.clientSecret && result.orderId) {
        setClientSecret(result.clientSecret);
        setOrderId(result.orderId);
      }
    }).catch((err) => {
      setLoadingPI(false);
      piCreating.current = false;
      console.error("[PI error]", err);
      setError("Erreur lors de la préparation du paiement.");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerInfoComplete, showPaymentSection]);

  async function handlePromoCode() {
    setPromoLoading(true); setPromoError(null);
    const result = await validatePromoCodeAction(event.id, promoInput);
    setPromoLoading(false);
    if (result.error) { setPromoError(result.error); setPromoResult(null); }
    else { setPromoResult(result.promo!); }
  }

  function updateHolder(ticketTypeId: string, index: number, field: string, value: string) {
    setHolderData((prev) => {
      const current = prev[ticketTypeId] ?? [];
      const updated = [...current];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, [ticketTypeId]: updated };
    });
  }

  function handleFreeSubmit() {
    if (!buyerInfoFilled) { setError("Veuillez remplir vos coordonnées."); return; }
    setError(null);
    startTransition(async () => {
      const result = await createFreeOrderAction({
        eventId: event.id, buyerEmail: email,
        buyerFirstName: firstName, buyerLastName: lastName,
        buyerPhone: phone || null, promoCodeId: promoResult?.id ?? null,
        items: cartItems.map((item) => ({
          ticketTypeId: item.ticketTypeId, quantity: item.quantity,
          holderData: item.ticketType.isNominative ? (holderData[item.ticketTypeId] ?? []) : undefined,
          seatIds: selectedSeatsByType[item.ticketTypeId] ?? [],
        })),
      });
      if (result.error) { setError(result.error); return; }
      if (result.orderId && result.magicToken) onSuccess(result.orderId, result.magicToken);
    });
  }

  // Determine section numbers based on whether seat picker is shown
  const seatSectionNum = 2;
  const buyerSectionNum = needsSeatPicker ? 3 : 2;
  const paymentSectionNum = needsSeatPicker ? 4 : 3;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex items-center gap-3">
        <button type="button" onClick={onBack}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Retour">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-base font-semibold text-gray-900">Billetterie</h2>
      </div>

      <div className="p-5 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">{error}</div>
        )}

        {/* ── Section 1 : Billets ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">1. Choisissez vos billets</h3>
          {availableTickets.map((tt) => {
            const qty = quantities[tt.id] ?? 0;
            const available = tt.quantity !== null ? tt.quantity - tt.quantitySold : null;
            return (
              <div key={tt.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{tt.name}</p>
                  <p className="text-xs text-violet-600 font-semibold">
                    {tt.priceCents === 0 ? "Gratuit" : `${(tt.priceCents / 100).toFixed(2)}€`}
                  </p>
                  {available !== null && available > 0 && available <= 10 && (
                    <p className="text-xs text-amber-600">{available} restant{available > 1 ? "s" : ""}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => onQuantityChange({ ...quantities, [tt.id]: Math.max(0, qty - 1) })}
                    disabled={qty <= 0}
                    className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30">−</button>
                  <span className="w-5 text-center text-sm font-medium">{qty}</span>
                  <button type="button" onClick={() => onQuantityChange({ ...quantities, [tt.id]: Math.min(tt.maxPerOrder, qty + 1) })}
                    disabled={qty >= tt.maxPerOrder || (available !== null && qty >= available)}
                    className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30">+</button>
                </div>
              </div>
            );
          })}

          {/* Promo */}
          {totalItems > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="flex gap-2">
                <input type="text" value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoResult(null); setPromoError(null); }}
                  placeholder="Code promo"
                  className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none transition-colors" />
                <button type="button" onClick={handlePromoCode} disabled={!promoInput || promoLoading}
                  className="px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  {promoLoading ? "..." : "Appliquer"}
                </button>
              </div>
              {promoError && <p className="text-xs text-red-500">{promoError}</p>}
              {promoResult && (
                <p className="text-xs text-green-600 font-medium">
                  ✓ {promoResult.type === "PERCENTAGE" ? `${promoResult.value}% de réduction` : promoResult.type === "FREE" ? "Gratuit !" : `${(promoResult.value / 100).toFixed(2)}€ de réduction`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Section 2 : Choix des sièges (if applicable) ── */}
        {needsSeatPicker && totalItems > 0 && seatingMap && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{seatSectionNum}. Choisissez vos sièges</h3>
              {seatStepDone && (
                <button
                  type="button"
                  onClick={() => setSeatStepDone(false)}
                  className="text-xs text-violet-600 hover:underline"
                >
                  Modifier
                </button>
              )}
            </div>

            {seatStepDone ? (
              <div className="bg-violet-50 rounded-xl p-3 space-y-1">
                {Object.entries(selectedSeatsByType).map(([ttId, seatIds]) => {
                  const tt = cartItems.find((i) => i.ticketTypeId === ttId)?.ticketType;
                  if (!tt || seatIds.length === 0) return null;
                  // Find seat labels from the map
                  const allSeats = seatingMap.rows.flatMap((r) => r.seats);
                  const labels = seatIds.map((id) => allSeats.find((s) => s.id === id)?.label ?? id);
                  return (
                    <p key={ttId} className="text-xs text-violet-800">
                      <span className="font-medium">{tt.name}:</span>{" "}
                      {labels.join(", ")}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <SeatPicker
                  seatingMap={seatingMap}
                  requiredByType={requiredByType}
                  selectedByType={selectedSeatsByType}
                  onChange={setSelectedSeatsByType}
                  primaryColor={primaryColor}
                />
                <button
                  type="button"
                  disabled={!seatsComplete}
                  onClick={() => setSeatStepDone(true)}
                  className="w-full py-2.5 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  style={{ backgroundColor: seatsComplete ? primaryColor : undefined }}
                >
                  Confirmer la sélection
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Section 2/3 : Coordonnées ── */}
        {showBuyerSection && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">{buyerSectionNum}. Vos coordonnées</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" required>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="Jean" />
              </Field>
              <Field label="Nom" required>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Dupont" />
              </Field>
            </div>
            <Field label="Email" required>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="jean@exemple.com" />
            </Field>
            <Field label="Téléphone">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+33 6 12 34 56 78" />
            </Field>

            {/* Titulaires nominatifs */}
            {hasNominative && cartItems.filter((i) => i.ticketType.isNominative).map((item) => (
              <div key={item.ticketTypeId} className="space-y-2">
                <p className="text-xs font-semibold text-gray-600">Titulaires — {item.ticketType.name}</p>
                {Array.from({ length: item.quantity }, (_, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-gray-500">Billet {i + 1}</p>
                    {i === 0 && (
                      <button type="button" onClick={() => {
                        updateHolder(item.ticketTypeId, 0, "firstName", firstName);
                        updateHolder(item.ticketTypeId, 0, "lastName", lastName);
                        updateHolder(item.ticketTypeId, 0, "email", email);
                      }} className="text-xs text-violet-600 hover:underline">Utiliser mes coordonnées</button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Prénom" value={holderData[item.ticketTypeId]?.[i]?.firstName ?? ""}
                        onChange={(e) => updateHolder(item.ticketTypeId, i, "firstName", e.target.value)} className={`${inputCls} text-xs`} />
                      <input type="text" placeholder="Nom" value={holderData[item.ticketTypeId]?.[i]?.lastName ?? ""}
                        onChange={(e) => updateHolder(item.ticketTypeId, i, "lastName", e.target.value)} className={`${inputCls} text-xs`} />
                    </div>
                    <input type="email" placeholder="Email" value={holderData[item.ticketTypeId]?.[i]?.email ?? ""}
                      onChange={(e) => updateHolder(item.ticketTypeId, i, "email", e.target.value)} className={`${inputCls} text-xs w-full`} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Section 3/4 : Récap + paiement ── */}
        {showPaymentSection && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">{paymentSectionNum}. Paiement</h3>
            {/* Récap prix */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              {subtotal !== discountedSubtotal && (
                <div className="flex justify-between text-green-600">
                  <span>Réduction ({promoResult?.code})</span>
                  <span>−{(discount / 100).toFixed(2)}€</span>
                </div>
              )}
              {!isFreeOrder && (
                <div className="flex justify-between text-gray-400 text-xs">
                  <span className="flex items-center gap-1">
                    Frais de service inclus
                    <span
                      title={`Frais de service Evoly : ~${(estimatedFees / 100).toFixed(2)}€ (${Math.round(commissionRate * 100)}% prélevés sur le montant reversé à l'organisateur). Aucun frais supplémentaire pour vous.`}
                      className="cursor-help text-gray-300 hover:text-gray-400"
                    >ⓘ</span>
                  </span>
                  <span className="text-gray-300">inclus</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200">
                <span>Total</span>
                <span>{isFreeOrder ? "Gratuit" : `${(total / 100).toFixed(2)}€`}</span>
              </div>
            </div>

            {/* Paiement */}
            {isFreeOrder ? (
              <button type="button" onClick={handleFreeSubmit} disabled={isPending}
                className="w-full py-3 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2" style={{ backgroundColor: primaryColor }}>
                {isPending && <Spinner />}
                Confirmer l&apos;inscription
              </button>
            ) : clientSecret && orderId ? (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: primaryColor } }, locale: "fr" }}>
                <StripeForm clientSecret={clientSecret} orderId={orderId} total={total} primaryColor={primaryColor} />
              </Elements>
            ) : (
              <div className="w-full py-3 bg-violet-200 rounded-xl flex items-center justify-center gap-2 text-violet-500 text-sm">
                <Spinner /> Préparation du paiement…
              </div>
            )}
          </div>
        )}

        {totalItems === 0 && (
          <p className="text-center text-sm text-gray-400 py-4">Sélectionnez au moins un billet pour continuer.</p>
        )}
      </div>
    </div>
  );
}

// ─── Stripe form (inside <Elements>) ─────────────────────────────────────────

function StripeForm({ clientSecret, orderId, total, primaryColor }: {
  clientSecret: string; orderId: string; total: number; primaryColor: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);
  const appUrl = typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me");

  async function handlePay() {
    if (!stripe || !elements) return;
    setProcessing(true); setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) { setError(submitError.message ?? "Erreur."); setProcessing(false); return; }
    const { error: confirmError } = await stripe.confirmPayment({
      elements, clientSecret,
      confirmParams: { return_url: `${appUrl}/confirmation/${orderId}` },
    });
    if (confirmError) { setError(confirmError.message ?? "Paiement refusé."); setProcessing(false); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">{error}</div>}

      <ExpressCheckoutElement
        onReady={() => {}}
        onConfirm={async () => {
          if (!stripe || !elements) return;
          const { error } = await stripe.confirmPayment({
            elements, clientSecret,
            confirmParams: { return_url: `${appUrl}/confirmation/${orderId}` },
          });
          if (error) setError(error.message ?? "Erreur.");
        }}
        options={{ buttonHeight: 48 }}
      />

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">ou par carte</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <PaymentElement
        onReady={() => setReady(true)}
        options={{ layout: "tabs" }}
      />

      <button type="button" onClick={handlePay}
        disabled={processing || !ready}
        className="w-full py-3 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2" style={{ backgroundColor: primaryColor }}>
        {processing && <Spinner />}
        {processing ? "Traitement…" : `Payer ${(total / 100).toFixed(2)}€`}
      </button>
      <p className="text-center text-xs text-gray-400">🔒 Paiement sécurisé par Stripe</p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none transition-colors";
