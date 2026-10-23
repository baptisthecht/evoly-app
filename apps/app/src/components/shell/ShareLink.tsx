"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** « Partager le lien » : le partage du téléphone s'il existe, sinon le lien copié (confirmé deux secondes). */
export function ShareLink({ url, title }: { url: string; title: string }) {
  const t = useTranslations("nav");
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (
      typeof navigator.share === "function" &&
      window.matchMedia?.("(pointer: coarse)").matches
    ) {
      try {
        await navigator.share({ url, title });
        return;
      } catch {
        // partage annulé : rien à faire
        return;
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button type="button" onClick={share} aria-live="polite">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {copied ? t("linkCopied") : t("shareLink")}
    </Button>
  );
}
