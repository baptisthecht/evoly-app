"use client";

import { useEffect } from "react";

/** Signal de visite de la billetterie, envoyé une fois après l'affichage : aucun cookie, rien n'est lu dans le navigateur. */
export function ViewBeacon({ eventId }: { eventId: string }) {
  useEffect(() => {
    const url = `/api/v/${encodeURIComponent(eventId)}`;
    try {
      if (!navigator.sendBeacon?.(url)) void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    } catch {
      // jamais bloquant pour la page
    }
  }, [eventId]);
  return null;
}
