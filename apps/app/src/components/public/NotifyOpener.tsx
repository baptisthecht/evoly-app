"use client";

import { useEffect } from "react";
import { notifyOrderCompleted } from "./embedEvents";

/** Retour de la banque (Bancontact, iDEAL, Wero…) sur la page des billets : la page d'origine apprend la commande terminée (RG-EMB-07). */
export function NotifyOpener({
  tickets,
  amountMinor,
  currency,
}: {
  tickets: number;
  amountMinor: number;
  currency: string;
}) {
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("redirect_status") ===
      "succeeded"
    )
      notifyOrderCompleted(tickets, amountMinor, currency);
  }, [tickets, amountMinor, currency]);
  return null;
}
