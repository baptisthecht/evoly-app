"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** « Partager le lien » : le partage du téléphone s'il existe, sinon le lien copié (confirmé deux secondes). */
export function ShareLink({ url, title }: { url: string; title: string }) {
  const t = useTranslations("nav");
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches) {
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
      {copied ? t("linkCopied") : t("shareLink")}
    </Button>
  );
}
