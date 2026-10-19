"use client";

import { useTranslations } from "next-intl";
import { openConsent } from "./cookies";

/** « Gérer les cookies » : rouvre le bandeau pour changer ou retirer son consentement à tout moment. */
export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations("consent");
  return (
    <button type="button" onClick={openConsent} className={className ?? "text-xs text-ink-muted underline"}>
      {t("manage")}
    </button>
  );
}
