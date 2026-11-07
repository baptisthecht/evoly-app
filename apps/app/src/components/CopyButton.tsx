"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "./ui/Button";

export function CopyButton({
  value,
  label,
  size = "sm",
}: {
  value: string;
  label?: string;
  /** « md » à côté d'un champ (34 px), sinon petit (30 px). */
  size?: "sm" | "md";
}) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      aria-live="polite"
    >
      {copied ? t("copied") : (label ?? t("copy"))}
    </Button>
  );
}
