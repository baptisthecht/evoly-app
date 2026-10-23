"use client";
import { useTranslations } from "next-intl";

/**
 * Retour de Google ou d'Apple sans connexion : annulée par l'organisateur
 * (access_denied), ou toute autre erreur du fournisseur.
 */
export function SocialError({ error }: { error?: string | null }) {
  const t = useTranslations("auth");
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-surface-sunken p-3 text-sm text-ink"
    >
      {t(error === "access_denied" ? "socialCancelled" : "socialError")}
    </p>
  );
}
