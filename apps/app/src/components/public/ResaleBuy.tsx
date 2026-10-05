"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { reserveResaleAction, type ReservationView } from "@/app/site/[sub]/[eventSlug]/actions";
import { Button } from "../ui/Button";
import { CheckoutPanel } from "./CheckoutPanel";

/** Achat d'une place en revente : réservation de l'annonce, puis tunnel d'achat habituel. */
export function ResaleBuy({
  linkCode,
  label,
  organizationName,
  requirePhone,
  publishableKey,
}: {
  linkCode: string;
  label: string;
  organizationName: string;
  requirePhone: boolean;
  publishableKey: string | null;
}) {
  const t = useTranslations("resale");
  const tc = useTranslations("checkout");
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (reservation)
    return (
      <CheckoutPanel
        reservation={reservation}
        organizationName={organizationName}
        requirePhone={requirePhone}
        publishableKey={publishableKey}
        onCancel={() => setReservation(null)}
      />
    );
  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await reserveResaleAction(linkCode);
          setBusy(false);
          if (res.ok) return setReservation(res.data);
          setError(t.has(`error_${res.error}`) ? t(`error_${res.error}`) : tc("error_UNKNOWN"));
        }}
      >
        {busy ? tc("processing") : label}
      </Button>
    </div>
  );
}
