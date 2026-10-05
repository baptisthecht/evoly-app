"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";

/** Section 9.22 : lien de parrainage et résultats. */
export function ReferralCard({ url, signedUp, qualified, rewarded }: { url: string; signedUp: number; qualified: number; rewarded: number }) {
  const t = useTranslations("referral");
  const [copied, setCopied] = useState(false);
  return (
    <Card className="grid gap-3">
      <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("title")}</h2>
      <p className="-mt-1 text-sm text-ink-muted">{t("intro")}</p>
      <div className="flex flex-wrap gap-2">
        <Input
          readOnly
          value={url}
          aria-label={t("link")}
          className="min-w-0 flex-1 font-mono text-base"
          data-testid="referral-link"
          onFocus={(e) => e.currentTarget.select()}
        />
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
      <p className="text-sm">{t("stats", { signedUp, qualified, rewarded })}</p>
    </Card>
  );
}
