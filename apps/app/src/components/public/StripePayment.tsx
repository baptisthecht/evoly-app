"use client";

import { palette } from "@evoly/ui";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import type { ReactNode } from "react";
import { Button } from "../ui/Button";

const instances = new Map<string, Promise<Stripe | null>>();

/** Stripe.js chargé pour le compte de l'organisateur : charges directes (RG-PAY-02). */
function stripeFor(publishableKey: string, stripeAccount: string) {
  const key = `${publishableKey}:${stripeAccount}`;
  if (!instances.has(key)) instances.set(key, loadStripe(publishableKey, { stripeAccount }));
  return instances.get(key)!;
}

/** Payment Element en création différée : les moyens de paiement s'affichent avant la création de l'intention (RG-PAY-03). */
export function StripePayment({ publishableKey, stripeAccountId, amountMinor, currency, locale, children }: { publishableKey: string; stripeAccountId: string; amountMinor: number; currency: string; locale: string; children: ReactNode }) {
  return (
    <Elements
      stripe={stripeFor(publishableKey, stripeAccountId)}
      options={{
        mode: "payment",
        amount: amountMinor,
        currency: currency.toLowerCase(),
        locale: locale === "en" ? "en" : "fr",
        appearance: { theme: "stripe", variables: { colorPrimary: palette.charbon, colorText: palette.charbon, colorDanger: palette.danger, borderRadius: "12px", fontFamily: "Poppins, system-ui, sans-serif", spacingUnit: "4px" } },
      }}
    >
      {children}
    </Elements>
  );
}

export function PaymentFields() {
  return <PaymentElement options={{ layout: "tabs" }} />;
}

/** Bouton de paiement : doit être placé dans <StripePayment>. */
export function PayButton({ label, busy, onPay }: { label: string; busy: boolean; onPay: (stripe: Stripe, elements: StripeElements) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  return (
    <Button type="button" size="lg" className="w-full" disabled={!stripe || !elements || busy} aria-busy={busy} onClick={() => stripe && elements && onPay(stripe, elements)}>
      {label}
    </Button>
  );
}
