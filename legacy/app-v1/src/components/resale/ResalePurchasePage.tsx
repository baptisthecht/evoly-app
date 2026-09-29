"use client";

import { useState, useTransition } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { initResalePurchaseAction } from "@/actions/resale";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Brand {
  primaryColor: string | null;
  logoUrl: string | null;
  brandName: string | null;
}

interface Props {
  token: string;
  resaleLink: {
    priceCents: number;
    originalPriceCents: number;
    expiresAt: string;
  };
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    timezone: string;
    locationType: string;
    locationName: string | null;
    locationAddress: string | null;
    bannerUrl: string | null;
    slug: string;
    organization: {
      name: string;
      slug: string;
      stripeAccountStatus: string;
      brand: Brand | null;
    };
  };
}

export function ResalePurchasePage({ token, resaleLink, event }: Props) {
  const brand = event.organization.brand;
  const primaryColor = brand?.primaryColor ?? "#7c3aed";
  const brandName = brand?.brandName ?? "evoly";
  const brandLogo = brand?.logoUrl;

  const [step, setStep] = useState<"form" | "payment">("form");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [buyerInfo, setBuyerInfo] = useState({
    email: "",
    firstName: "",
    lastName: "",
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const eventDate = new Date(event.startsAt).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const locationLine =
    event.locationType === "ONLINE"
      ? "En ligne"
      : [event.locationName, event.locationAddress].filter(Boolean).join(" — ");

  function handleContinue() {
    if (!buyerInfo.email || !buyerInfo.firstName || !buyerInfo.lastName) {
      setError("Tous les champs sont obligatoires");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await initResalePurchaseAction({
        token,
        buyerEmail: buyerInfo.email,
        buyerFirstName: buyerInfo.firstName,
        buyerLastName: buyerInfo.lastName,
      });
      if ("error" in result) {
        setError(result.error ?? "Erreur inconnue");
        return;
      }
      if ("free" in result && result.free) {
        // Billet gratuit : achat immédiat, rediriger vers confirmation
        window.location.href = `/resale/${token}/confirmation?free=1`;
        return;
      }
      if (result.clientSecret) {
        setClientSecret(result.clientSecret);
        setStep("payment");
      }
    });
  }

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ "--brand-primary": primaryColor } as React.CSSProperties}
    >
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt={brandName} className="h-7 w-auto" />
            ) : (
              <span className="font-bold text-lg" style={{ color: primaryColor }}>
                {brandName}
              </span>
            )}
          </a>
          <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-1 rounded-full">
            Revente sécurisée
          </span>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
        {/* Event card */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {event.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.bannerUrl} alt="" className="w-full h-32 object-cover" />
          )}
          <div className="p-5">
            <h1 className="text-lg font-bold text-gray-900">{event.title}</h1>
            <p className="text-sm text-gray-500 mt-1">📅 {eventDate}</p>
            {locationLine && <p className="text-sm text-gray-500">📍 {locationLine}</p>}
          </div>
        </div>

        {/* Price info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Prix de revente</span>
            <span className="font-bold text-gray-900 text-lg">
              {(resaleLink.priceCents / 100).toFixed(2)}€
            </span>
          </div>
          {resaleLink.originalPriceCents > 0 && (
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-gray-400">Prix original</span>
              <span className="text-xs text-gray-400">
                {(resaleLink.originalPriceCents / 100).toFixed(2)}€
              </span>
            </div>
          )}
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-gray-400">Commission Evoly (5%)</span>
            <span className="text-xs text-gray-400">
              {(Math.round(resaleLink.priceCents * 0.05) / 100).toFixed(2)}€
            </span>
          </div>
          <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg px-3 py-2">
            ⏳ Lien valable jusqu&apos;au{" "}
            {new Date(resaleLink.expiresAt).toLocaleString("fr-FR", {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* Step 1: Buyer info */}
        {step === "form" && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Vos coordonnées</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prénom</label>
                <input
                  type="text"
                  value={buyerInfo.firstName}
                  onChange={(e) => setBuyerInfo((p) => ({ ...p, firstName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
                <input
                  type="text"
                  value={buyerInfo.lastName}
                  onChange={(e) => setBuyerInfo((p) => ({ ...p, lastName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={buyerInfo.email}
                onChange={(e) => setBuyerInfo((p) => ({ ...p, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              onClick={handleContinue}
              disabled={isPending}
              className="w-full py-3 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {isPending ? "Préparation…" : `Continuer · ${(resaleLink.priceCents / 100).toFixed(2)}€`}
            </button>
          </div>
        )}

        {/* Step 2: Payment */}
        {step === "payment" && clientSecret && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Paiement sécurisé</h2>
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, locale: "fr" }}
            >
              <ResalePaymentForm
                priceCents={resaleLink.priceCents}
                primaryColor={primaryColor}
                token={token}
              />
            </Elements>
          </div>
        )}
      </div>
    </div>
  );
}

function ResalePaymentForm({
  priceCents,
  primaryColor,
  token,
}: {
  priceCents: number;
  primaryColor: string;
  token: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

  async function handlePay() {
    if (!stripe || !elements) return;
    setIsPaying(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Erreur lors du paiement");
      setIsPaying(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${appUrl}/resale/${token}/confirmation`,
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "Paiement refusé");
      setIsPaying(false);
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <p className="text-xs text-gray-400 flex items-center gap-1">
        🔒 Paiement sécurisé par Stripe
      </p>
      <button
        onClick={handlePay}
        disabled={isPaying || !stripe}
        className="w-full py-3 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
        style={{ backgroundColor: primaryColor }}
      >
        {isPaying ? "Traitement…" : `Payer ${(priceCents / 100).toFixed(2)}€`}
      </button>
    </div>
  );
}
