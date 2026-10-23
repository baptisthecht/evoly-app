"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CheckoutPanel } from "@/components/public/CheckoutPanel";
import type { ReservationView } from "../../[eventSlug]/actions";

/** Paiement sur place par QR code (section 9.27) : le panneau de paiement habituel, ouvert sur le téléphone du client. */
export function PayAtVenue(props: {
  reservation: ReservationView;
  organizationName: string;
  requirePhone: boolean;
  publishableKey: string | null;
}) {
  const t = useTranslations("public");
  const [cancelled, setCancelled] = useState(false);
  if (cancelled) return <p className="text-lg">{t("payCancelled")}</p>;
  return (
    <CheckoutPanel
      reservation={props.reservation}
      seatMap={null}
      friendName={null}
      organizationName={props.organizationName}
      requirePhone={props.requirePhone}
      publishableKey={props.publishableKey}
      onCancel={() => setCancelled(true)}
    />
  );
}
