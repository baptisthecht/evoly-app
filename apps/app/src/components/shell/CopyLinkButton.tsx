"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** « Copier le lien » (refonte A3, maquettes UIUX/) : copie l'adresse publique, confirmée deux secondes par « Lien copié ». */
export function CopyLinkButton({ url }: { url: string }) {
  const t = useTranslations("nav");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button type="button" variant="secondary" onClick={copy} aria-live="polite">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
      </svg>
      {copied ? t("linkCopied") : t("copyLink")}
    </Button>
  );
}
