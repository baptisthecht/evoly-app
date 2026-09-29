"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "./ui/Button";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
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
