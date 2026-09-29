"use client";

import { estimateBankFee, parseMajorToMinor, resaleAmounts, type FeeTerms } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createListingAction, withdrawListingAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { CopyButton } from "../CopyButton";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";

/** Mise en revente depuis la page des billets (section 9.13, étapes 1 à 3). */
export function ResaleControl({ token, ticketId, currency, faceValueMinor, terms, listing, canResell }: { token: string; ticketId: string; currency: string; faceValueMinor: number; terms: FeeTerms; listing: { id: string; status: string; priceMinor: number; url: string } | null; canResell: boolean }) {
  const t = useTranslations("resale");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(faceValueMinor / 100).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (v: number) => formatMoney(v, currency, locale, { trimZeroCents: true });
  const explain = (code: string) => (t.has(`error_${code}`) ? t(`error_${code}`) : t("error_UNKNOWN"));

  if (listing) {
    return (
      <div className="grid w-full min-w-0 gap-2 rounded-md bg-surface-accent p-3 text-left text-sm">
        <p className="font-semibold">{listing.priceMinor === 0 ? t("listedFree") : t("listedAt", { price: money(listing.priceMinor) })}</p>
        {listing.status === "RESERVED" ? <p>{t("reservedNow")}</p> : <p className="text-ink-muted">{t("shareHint")}</p>}
        <div className="flex w-full min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-md bg-surface-raised px-2 py-1.5 font-mono text-xs" data-testid="resale-url">
            {listing.url}
          </span>
          <CopyButton value={listing.url} />
        </div>
        {listing.status === "ACTIVE" ? (
          <button
            type="button"
            disabled={busy}
            className="justify-self-start font-semibold underline underline-offset-4"
            onClick={async () => {
              setBusy(true);
              const res = await withdrawListingAction(token, listing.id);
              setBusy(false);
              if (!res.ok) return setError(explain(res.error));
              router.refresh();
            }}
          >
            {t("withdraw")}
          </button>
        ) : null}
        {error ? <p role="alert" className="text-danger">{error}</p> : null}
      </div>
    );
  }
  if (!canResell) return null;
  if (!open)
    return (
      <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => setOpen(true)}>
        {t("resell")}
      </button>
    );
  const minor = parseMajorToMinor(price);
  const amounts = minor != null && minor <= faceValueMinor ? resaleAmounts(minor, terms, estimateBankFee(minor)) : null;
  return (
    <div className="grid w-full min-w-0 gap-3 rounded-md bg-surface-sunken p-3 text-left text-sm">
      <label className="grid gap-1 font-semibold">
        {t("priceLabel", { max: money(faceValueMinor) })}
        <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby={`resale-est-${ticketId}`} />
      </label>
      <p id={`resale-est-${ticketId}`} aria-live="polite">
        {minor == null ? t("priceInvalid") : minor > faceValueMinor ? t("aboveFaceValue", { max: money(faceValueMinor) }) : minor === 0 ? t("freeTransfer") : t("youGetBack", { amount: money(amounts!.sellerRefundMinor) })}
      </p>
      {amounts && minor! > 0 ? <p className="text-xs text-ink-muted">{t("feesExplained", { commission: money(amounts.commissionMinor), bank: money(amounts.bankFeeMinor) })}</p> : null}
      {error ? <p role="alert" className="text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="dark"
          disabled={busy || !amounts}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await createListingAction(token, ticketId, price);
            setBusy(false);
            if (!res.ok) return setError(explain(res.error));
            router.refresh();
          }}
        >
          {t("list")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
