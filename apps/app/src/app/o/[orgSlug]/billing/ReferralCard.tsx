"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SettingsRow } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Field";

/** Section 9.22 : lien de parrainage et résultats. */
export function ReferralCard({
  url,
  signedUp,
  qualified,
  rewarded,
}: {
  url: string;
  signedUp: number;
  qualified: number;
  rewarded: number;
}) {
  const t = useTranslations("referral");
  const [copied, setCopied] = useState(false);
  return (
    // refonte A3 (maquette « Réglages de l'événement ») : une rangée, le titre et l'explication à gauche
    <SettingsRow title={t("title")} description={t("intro")}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <Input
            readOnly
            value={url}
            aria-label={t("link")}
            data-testid="referral-link"
            onFocus={(e) => e.currentTarget.select()}
          />
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(url).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <p className="text-[13px] text-ink-muted">
        {t("stats", { signedUp, qualified, rewarded })}
      </p>
    </SettingsRow>
  );
}
