"use client";

import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

/** Vente sur place en espèces depuis le scanner (section 9.27) : tarifs, total, e-mail facultatif, entrée validée. */
export function SellPanel({
  token,
  deviceId,
  sale,
}: {
  token: string;
  deviceId: string;
  sale: { currency: string; ticketTypes: Array<{ id: string; name: string; priceMinor: number; remaining: number }> };
}) {
  const t = useTranslations("scanner");
  const locale = useLocale() as Locale;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: true; tickets: number } | { ok: false; error: string } | null>(null);
  const [left, setLeft] = useState<Record<string, number>>(Object.fromEntries(sale.ticketTypes.map((tt) => [tt.id, tt.remaining])));
  const total = sale.ticketTypes.reduce((n, tt) => n + (qty[tt.id] ?? 0) * tt.priceMinor, 0);
  const count = Object.values(qty).reduce((n, q) => n + q, 0);
  const money = (v: number) => formatMoney(v, sale.currency, locale, { trimZeroCents: true });
  const set = (id: string, v: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(v, left[id] ?? 0, 50)) }));
  const sell = async () => {
    if (count === 0) return setResult({ ok: false, error: "EMPTY" });
    if (!navigator.onLine) return setResult({ ok: false, error: "OFFLINE" });
    setPending(true);
    const lines = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const res = await fetch(`/api/scanner/${token}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cash", lines, email: email.trim() || undefined, deviceId }),
    }).catch(() => null);
    setPending(false);
    if (!res || !res.ok) return setResult({ ok: false, error: "FAILED" });
    const data = (await res.json()) as { tickets: number };
    setLeft((l) => Object.fromEntries(Object.entries(l).map(([id, n]) => [id, n - (qty[id] ?? 0)])));
    setQty({});
    setEmail("");
    setResult({ ok: true, tickets: data.tickets });
    navigator.vibrate?.(80);
  };
  return (
    <section aria-label={t("tab_sell")} className="mx-4 mb-4 grid gap-3 rounded-2xl bg-blanc p-4 text-[var(--evoly-charbon)]">
      <ul className="grid gap-2">
        {sale.ticketTypes.map((tt) => {
          const n = qty[tt.id] ?? 0;
          return (
            <li key={tt.id} className="flex items-center justify-between gap-3">
              <div className="grid">
                <span className="font-semibold">{tt.name}</span>
                <span className="text-sm tabular-nums">{(left[tt.id] ?? 0) > 0 ? money(tt.priceMinor) : t("sellSoldOut")}</span>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label={tt.name}>
                <button
                  type="button"
                  onClick={() => set(tt.id, n - 1)}
                  disabled={n === 0}
                  className="size-11 rounded-full text-lg font-semibold ring-1 ring-[var(--evoly-charbon)] disabled:opacity-40"
                  aria-label={`− ${tt.name}`}
                >
                  −
                </button>
                <output className="w-8 text-center font-display text-lg tabular-nums">{n}</output>
                <button
                  type="button"
                  onClick={() => set(tt.id, n + 1)}
                  disabled={n >= (left[tt.id] ?? 0)}
                  className="size-11 rounded-full bg-[var(--evoly-charbon)] text-lg font-semibold text-[var(--evoly-creme)] disabled:opacity-40"
                  aria-label={`+ ${tt.name}`}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <label className="grid gap-1 text-sm">
        <span>{t("sellEmail")}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          className="h-11 rounded-xl px-3 ring-1 ring-[var(--evoly-charbon)]"
        />
      </label>
      <button
        type="button"
        onClick={sell}
        disabled={pending || count === 0}
        className="h-12 rounded-full bg-[var(--evoly-charbon)] font-semibold text-[var(--evoly-creme)] disabled:opacity-40"
      >
        {t("sellCash", { amount: money(total) })}
      </button>
      {result?.ok ? (
        <p role="status" className="text-sm font-semibold">
          {t("sellDone", { count: result.tickets })}
        </p>
      ) : null}
      {result && !result.ok ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {result.error === "OFFLINE" ? t("sellOffline") : result.error === "EMPTY" ? t("sellEmpty") : t("sellError")}
        </p>
      ) : null}
    </section>
  );
}
