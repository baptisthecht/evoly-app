"use client";

import { grossForNet, netForGross, parseMajorToMinor, roundedPriceOptions, type FeeTerms } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Field, Input } from "@/components/ui/Field";
import { FeePreview } from "./FeePreview";

/** Montant en centimes → saisie (« 21,29 » en français, « 21.29 » en anglais, sans « ,00 »). */
function toInput(minor: number, locale: string): string {
  const s = (minor / 100).toFixed(2);
  const v = s.endsWith(".00") ? s.slice(0, -3) : s;
  return locale === "fr" ? v.replace(".", ",") : v;
}

/**
 * Aide au prix : l'organisateur saisit ce qu'il veut toucher, ou le prix payé par le participant ; l'autre champ se
 * calcule (commission de son offre et frais de paiement de référence, plafond compris). Le formulaire envoie toujours le
 * prix payé par le participant : le serveur et le paiement ne changent pas.
 */
export function PriceFields({ id, name, label, hint, error, price, onPrice, terms, locked = false, compact = false }: { id: string; name?: string; label: string; hint?: string; error?: string | null; price: string; onPrice: (value: string) => void; terms: FeeTerms; locked?: boolean; compact?: boolean }) {
  const t = useTranslations("tickets");
  const locale = useLocale() as Locale;
  const [netText, setNetText] = useState<string | null>(null); // null : déduit du prix
  const priceMinor = parseMajorToMinor(price);
  const shownNet = netText ?? (priceMinor != null ? toInput(netForGross(priceMinor, terms), locale) : "");
  const onNet = (value: string) => {
    setNetText(value);
    const net = parseMajorToMinor(value);
    if (net != null) onPrice(toInput(grossForNet(net, terms), locale));
  };
  const setPrice = (value: string) => {
    setNetText(null);
    onPrice(value);
  };
  const options = !locked && priceMinor ? roundedPriceOptions(priceMinor) : [];
  const f = (v: number) => formatMoney(v, terms.currency, locale);
  const netInput = <Input id={`${id}-net`} inputMode="decimal" value={shownNet} onChange={(e) => onNet(e.target.value)} readOnly={locked} />;
  const priceInput = <Input id={id} name={name} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} readOnly={locked} required />;
  return (
    <div className="grid gap-3">
      {compact ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold">{t("youGet")}{netInput}</label>
          <label className="grid gap-1 text-xs font-bold">{label}{priceInput}</label>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("youGet")} htmlFor={`${id}-net`} hint={t("youGetHint")}>{netInput}</Field>
          <Field label={label} htmlFor={id} hint={hint} error={error}>{priceInput}</Field>
        </div>
      )}
      {options.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-muted">{t("roundTo")}</span>
          {options.map((o) => (
            <button key={o} type="button" onClick={() => setPrice(toInput(o, locale))} className="min-h-9 rounded-full px-3 font-semibold ring-1 ring-line-strong">{t("roundOption", { price: formatMoney(o, terms.currency, locale, { trimZeroCents: true }), net: f(netForGross(o, terms)) })}</button>
          ))}
        </div>
      ) : null}
      <FeePreview price={price} terms={terms} />
    </div>
  );
}
