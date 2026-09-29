"use client";

import { useState } from "react";
import { CheckoutFlow } from "./CheckoutFlow";
import type { SeatingMapData } from "./SeatPicker";

interface TicketType {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  quantity: number | null;
  quantitySold: number;
  maxPerOrder: number;
  minPerOrder: number;
  isNominative: boolean;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  seatingCategoryId: string | null;
}

interface EventData {
  id: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  locationType: string;
  locationName: string | null;
  locationAddress: string | null;
  refundPolicy: string;
  refundDeadlineDays: number | null;
  confirmationMessage: string | null;
  allowSeatChoice?: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    stripeAccountStatus: string;
    brand?: {
      brandName: string | null;
      logoUrl: string | null;
      primaryColor: string | null;
      accentColor: string | null;
      fromName: string | null;
    } | null;
  };
  ticketTypes: TicketType[];
}

interface Props {
  event: EventData;
  otherEvents: { id: string; title: string; slug: string; startsAt: string; bannerUrl: string | null }[];
  seatingMap?: SeatingMapData | null;
}

export function EventPublicPage({ event, otherEvents, seatingMap }: Props) {
  const [orderComplete, setOrderComplete] = useState<{ orderId: string; magicToken: string } | null>(null);
  // Shared quantities state — lives here so CheckoutFlow receives what TicketSelector set
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Brand colors — fallback to Evoly defaults
  const brand = event.organization.brand;
  const primaryColor = brand?.primaryColor ?? "#7c3aed";
  const accentColor = brand?.accentColor ?? "#a78bfa";
  const brandLogo = brand?.logoUrl ?? event.organization.logoUrl;
  const brandName = brand?.brandName ?? "evoly";

  const startDate = new Date(event.startsAt);
  const endDate = event.endsAt ? new Date(event.endsAt) : null;
  const now = new Date();
  const daysUntil = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const showCountdown = daysUntil > 0 && daysUntil <= 30;

  const hasAvailableTickets = event.ticketTypes.some((tt) => {
    const now = new Date();
    if (tt.saleStartsAt && new Date(tt.saleStartsAt) > now) return false;
    if (tt.saleEndsAt && new Date(tt.saleEndsAt) < now) return false;
    if (tt.quantity !== null && tt.quantitySold >= tt.quantity) return false;
    return true;
  });

  const stripeConnected = event.organization.stripeAccountStatus === "ACTIVE";
  const hasPaidTickets = event.ticketTypes.some((tt) => tt.priceCents > 0);
  const canBuy = hasAvailableTickets && (stripeConnected || !hasPaidTickets);

  // Redirect to dedicated confirmation page after purchase
  if (orderComplete) {
    if (typeof window !== "undefined") {
      window.location.href = `/confirmation/${orderComplete.orderId}`;
    }
    return <OrderConfirmation magicToken={orderComplete.magicToken} event={event} />;
  }

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ "--brand-primary": primaryColor, "--brand-accent": accentColor } as React.CSSProperties}
    >
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href={`/o/${event.organization.slug}`} className="flex items-center gap-2">
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt={event.organization.name} className="h-7 w-auto" />
            ) : (
              <span className="font-bold text-lg" style={{ color: primaryColor }}>{brandName}</span>
            )}
          </a>
          <span className="text-sm text-gray-500 hidden sm:block">{event.organization.name}</span>
        </div>
      </nav>

      {/* Banner */}
      <div className="relative h-48 sm:h-64 lg:h-80 overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}>
        {event.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.bannerUrl} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 max-w-5xl mx-auto">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">{event.title}</h1>
          <p className="text-white/80 mt-1 text-sm sm:text-base">
            {startDate.toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
            {" · "}
            {startDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            {endDate && ` → ${endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="lg:grid lg:grid-cols-3 lg:gap-8">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Key infos */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <InfoRow icon="📅" label="Date">
                {startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                {" à "}
                {startDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </InfoRow>
              {(event.locationType === "PHYSICAL" || event.locationType === "HYBRID") && event.locationName && (
                <InfoRow icon="📍" label="Lieu">
                  {event.locationName}
                  {event.locationAddress && <span className="text-gray-400"> · {event.locationAddress}</span>}
                </InfoRow>
              )}
              {(event.locationType === "ONLINE" || event.locationType === "HYBRID") && (
                <InfoRow icon="💻" label="Format">En ligne — lien envoyé après achat</InfoRow>
              )}
              <InfoRow icon="🎟️" label="Remboursement">
                {event.refundPolicy === "NON_REFUNDABLE" && "Non remboursable"}
                {event.refundPolicy === "ALWAYS_REFUNDABLE" && "Remboursable à tout moment"}
                {event.refundPolicy === "ORGANIZER_DEFINED" && event.refundDeadlineDays != null && `Remboursable jusqu'à ${event.refundDeadlineDays} jours avant`}
              </InfoRow>
            </div>

            {/* Countdown */}
            {showCountdown && (
              <CountdownBanner startsAt={event.startsAt} />
            )}

            {/* Description */}
            {event.description && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-3">À propos</h2>
                <div
                  className="prose prose-sm max-w-none text-gray-600"
                  dangerouslySetInnerHTML={{ __html: event.description }}
                />
              </div>
            )}

            {/* Other events */}
            {otherEvents.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Autres événements de {event.organization.name}
                </h2>
                <div className="space-y-3">
                  {otherEvents.map((e) => (
                    <a
                      key={e.id}
                      href={`/e/${e.slug}`}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-12 h-12 rounded-lg bg-violet-100 flex-shrink-0 overflow-hidden">
                        {e.bannerUrl
                          ? <img src={e.bannerUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-violet-400">🎟️</div>
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(e.startsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — unified checkout */}
          <div className="mt-6 lg:mt-0">
            <div className="sticky top-20">
              <CheckoutFlow
                event={event}
                quantities={quantities}
                onQuantityChange={setQuantities}
                onBack={() => {}}
                onSuccess={(orderId, magicToken) => setOrderComplete({ orderId, magicToken })}
                seatingMap={seatingMap}
              />
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}

// ── Ticket Selector ──

function TicketSelector({
  event, canBuy, stripeConnected, quantities, onQuantityChange, onContinue,
}: {
  event: EventData;
  canBuy: boolean;
  stripeConnected: boolean;
  quantities: Record<string, number>;
  onQuantityChange: (q: Record<string, number>) => void;
  onContinue: () => void;
}) {
  function setQty(id: string, qty: number) {
    onQuantityChange({ ...quantities, [id]: qty });
  }

  const totalItems = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = event.ticketTypes.reduce((acc, tt) => {
    return acc + (quantities[tt.id] ?? 0) * tt.priceCents;
  }, 0);

  const now = new Date();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Billets</h2>
      </div>

      <div className="p-5 space-y-4">
        {event.ticketTypes.map((tt) => {
          const available = tt.quantity !== null ? tt.quantity - tt.quantitySold : null;
          const isSoldOut = available !== null && available <= 0;
          const saleNotStarted = tt.saleStartsAt && new Date(tt.saleStartsAt) > now;
          const saleEnded = tt.saleEndsAt && new Date(tt.saleEndsAt) < now;
          const disabled = isSoldOut || !!saleNotStarted || !!saleEnded;

          const qty = quantities[tt.id] ?? 0;

          return (
            <div key={tt.id} className={`flex items-center justify-between gap-3 ${disabled ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{tt.name}</p>
                <p className="text-sm text-violet-600 font-semibold">
                  {tt.priceCents === 0 ? "Gratuit" : `${(tt.priceCents / 100).toFixed(2)}€`}
                </p>
                {isSoldOut && <p className="text-xs text-red-500">Complet</p>}
                {available !== null && available > 0 && available <= 10 && (
                  <p className="text-xs text-amber-600">{available} restant{available > 1 ? "s" : ""}</p>
                )}
                {saleNotStarted && (
                  <p className="text-xs text-gray-400">
                    Vente à partir du {new Date(tt.saleStartsAt!).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>

              {!disabled && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setQty(tt.id, Math.max(0, qty - 1))}
                    disabled={qty <= 0}
                    className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    aria-label="Diminuer"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-medium text-gray-900">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(tt.id, Math.min(tt.maxPerOrder, qty + 1))}
                    disabled={qty >= tt.maxPerOrder || (available !== null && qty >= available)}
                    className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    aria-label="Augmenter"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Subtotal */}
        {totalItems > 0 && subtotal > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Sous-total</span>
              <span className="font-medium text-gray-900">{(subtotal / 100).toFixed(2)}€</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              + commission Evoly calculée à l&apos;étape suivante
            </p>
          </div>
        )}

        {!stripeConnected && event.ticketTypes.some((tt) => tt.priceCents > 0) && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
            Les tickets payants ne sont pas disponibles pour le moment.
          </p>
        )}
      </div>

      <div className="p-5 pt-0">
        <button
          type="button"
          onClick={onContinue}
          disabled={totalItems === 0 || !canBuy}
          className="w-full py-3 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
          style={{ backgroundColor: "var(--brand-primary, #7c3aed)" }}
        >
          {totalItems === 0 ? "Sélectionnez des billets" : `Continuer · ${totalItems} billet${totalItems > 1 ? "s" : ""}`}
        </button>
      </div>

      <div className="px-5 pb-4 text-center">
        <p className="text-xs text-gray-400">🔒 Paiement sécurisé par Stripe</p>
      </div>
    </div>
  );
}

// ── Countdown ──

function CountdownBanner({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState(new Date());
  const target = new Date(startsAt);
  const diff = Math.max(0, target.getTime() - now.getTime());

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  // Update every second
  if (typeof window !== "undefined") {
    setTimeout(() => setNow(new Date()), 1000);
  }

  return (
    <div className="rounded-2xl p-5 text-white text-center" style={{ backgroundColor: "var(--brand-primary, #7c3aed)" }}>
      <p className="text-sm font-medium mb-3" style={{ color: "rgba(255,255,255,0.75)" }}>L&apos;événement commence dans</p>
      <div className="flex justify-center gap-4">
        {[{ v: days, l: "jours" }, { v: hours, l: "heures" }, { v: minutes, l: "min" }, { v: seconds, l: "sec" }].map(({ v, l }) => (
          <div key={l} className="text-center">
            <div className="text-2xl font-bold">{String(v).padStart(2, "0")}</div>
            <div className="text-xs text-violet-300">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Order Confirmation ──

function OrderConfirmation({ magicToken, event }: { magicToken: string; event: EventData }) {
  const ticketsUrl = `/tickets/${magicToken}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Commande confirmée !</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vos billets ont été envoyés à votre adresse email.
          </p>
        </div>

        {event.confirmationMessage && (
          <div className="bg-violet-50 rounded-xl p-4 text-sm text-violet-800 text-left">
            {event.confirmationMessage}
          </div>
        )}

        <a
          href={ticketsUrl}
          className="block w-full py-3 text-white font-semibold rounded-xl transition-colors"
          style={{ backgroundColor: "var(--brand-primary, #7c3aed)" }}
        >
          Voir mes billets
        </a>

        <div className="space-y-2">
          <p className="text-xs text-gray-400">Lien permanent vers vos billets :</p>
          <div className="bg-gray-50 rounded-lg p-2 font-mono text-xs text-gray-600 break-all">
            {typeof window !== "undefined" ? window.location.origin : ""}{ticketsUrl}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}${ticketsUrl}`)}
            className="text-xs text-violet-600 hover:underline"
          >
            Copier le lien
          </button>
        </div>

        <a href={`/e/${event.organization.slug}`} className="block text-xs text-gray-400 hover:text-gray-600">
          ← Retour aux événements de {event.organization.name}
        </a>
      </div>
    </div>
  );
}

// ── Helpers ──

function InfoRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900">{children}</p>
      </div>
    </div>
  );
}
