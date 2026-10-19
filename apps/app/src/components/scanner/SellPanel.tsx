"use client";

import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Vente sur place en espèces depuis le scanner (section 9.27) : tarifs, total, e-mail facultatif, entrée validée. */
export function SellPanel({
  token,
  deviceId,
  sale,
}: {
  token: string;
  deviceId: string;
  sale: {
    currency: string;
    ticketTypes: Array<{ id: string; name: string; priceMinor: number; remaining: number }>;
    options?: Array<{ id: string; name: string; priceMinor: number; left: number }>;
  };
}) {
  const t = useTranslations("scanner");
  const locale = useLocale() as Locale;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: true; tickets: number; passCode?: string | null } | { ok: false; error: string } | null>(null);
  const [left, setLeft] = useState<Record<string, number>>(
    Object.fromEntries([...sale.ticketTypes.map((tt) => [tt.id, tt.remaining] as const), ...(sale.options ?? []).map((o) => [o.id, o.left] as const)]),
  );
  // paiement par QR code : le client scanne et paie sur son téléphone, l'écran suit le paiement
  const [qr, setQr] = useState<{ orderId: string; qrSvg: string; totalMinor: number; status: string; tickets?: number } | null>(null);
  useEffect(() => {
    if (!qr || qr.status !== "PENDING") return;
    // le statut reçu ne vaut que pour la commande vérifiée : sinon une vérification en retard pouvait afficher « Payé »
    // pour une nouvelle vente qui ne l'était pas (et le bénévole remettre des billets non payés)
    const orderId = qr.orderId;
    let current = true;
    const id = setInterval(async () => {
      const res = await fetch(`/api/scanner/${token}/sell?order=${orderId}&device=${encodeURIComponent(deviceId)}`, { cache: "no-store" }).catch(() => null);
      if (!current || !res || !res.ok) return;
      const data = (await res.json()) as { status: string; tickets?: number };
      if (current && data.status !== "PENDING") {
        setQr((q) => (q && q.orderId === orderId ? { ...q, status: data.status, tickets: data.tickets } : q));
        if (data.status === "PAID") navigator.vibrate?.(120);
      }
    }, 2500);
    return () => {
      current = false;
      clearInterval(id);
    };
  }, [qr, token, deviceId]);
  const total =
    sale.ticketTypes.reduce((n, tt) => n + (qty[tt.id] ?? 0) * tt.priceMinor, 0) +
    (sale.options ?? []).reduce((n, o) => n + (qty[o.id] ?? 0) * o.priceMinor, 0);
  const count = Object.values(qty).reduce((n, q) => n + q, 0);
  const money = (v: number) => formatMoney(v, sale.currency, locale, { trimZeroCents: true });
  const set = (id: string, v: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(v, left[id] ?? 0, 50)) }));
  const sell = async () => {
    if (count === 0) return setResult({ ok: false, error: "EMPTY" });
    if (!navigator.onLine) return setResult({ ok: false, error: "OFFLINE" });
    setPending(true);
    const isOption = (id: string) => (sale.options ?? []).some((o) => o.id === id);
    const lines = Object.entries(qty)
      .filter(([id, q]) => q > 0 && !isOption(id))
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const options = Object.entries(qty)
      .filter(([id, q]) => q > 0 && isOption(id))
      .map(([optionId, quantity]) => ({ optionId, quantity }));
    const res = await fetch(`/api/scanner/${token}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cash", lines, options, email: email.trim() || undefined, deviceId }),
    }).catch(() => null);
    setPending(false);
    if (!res || !res.ok) return setResult({ ok: false, error: "FAILED" });
    const data = (await res.json()) as { tickets: number; optionsShortCode?: string | null };
    setLeft((l) => Object.fromEntries(Object.entries(l).map(([id, n]) => [id, n - (qty[id] ?? 0)])));
    setQty({});
    setEmail("");
    setResult({ ok: true, tickets: data.tickets, passCode: data.optionsShortCode ?? null });
    navigator.vibrate?.(80);
  };
  const startQr = async () => {
    if (count === 0) return setResult({ ok: false, error: "EMPTY" });
    if (!navigator.onLine) return setResult({ ok: false, error: "OFFLINE" });
    setPending(true);
    const isOption = (id: string) => (sale.options ?? []).some((o) => o.id === id);
    const lines = Object.entries(qty)
      .filter(([id, q]) => q > 0 && !isOption(id))
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const options = Object.entries(qty)
      .filter(([id, q]) => q > 0 && isOption(id))
      .map(([optionId, quantity]) => ({ optionId, quantity }));
    const res = await fetch(`/api/scanner/${token}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "qr", lines, options, deviceId }),
    }).catch(() => null);
    setPending(false);
    if (!res || !res.ok) return setResult({ ok: false, error: "FAILED" });
    const data = (await res.json()) as { orderId: string; qrSvg: string; totalMinor: number };
    setLeft((l) => Object.fromEntries(Object.entries(l).map(([id, n]) => [id, n - (qty[id] ?? 0)])));
    setResult(null);
    setQr({ ...data, status: "PENDING" });
  };
  if (qr) {
    return (
      <section
        aria-label={t("tab_sell")}
        aria-live="polite"
        className="mx-4 mb-4 grid justify-items-center gap-3 rounded-2xl bg-blanc p-4 text-center text-[var(--evoly-charbon)]"
      >
        {qr.status === "PENDING" ? (
          <>
            <p className="font-semibold">{t("sellQrTitle")}</p>
            <div className="w-full max-w-64" dangerouslySetInnerHTML={{ __html: qr.qrSvg }} />
            <p className="font-display text-2xl tabular-nums">{money(qr.totalMinor)}</p>
            <p className="text-sm">{t("sellQrWaiting")}</p>
          </>
        ) : qr.status === "PAID" ? (
          <p role="status" className="text-lg font-semibold">
            {t("sellQrPaid", { count: qr.tickets ?? 0 })}
          </p>
        ) : (
          <p role="alert" className="text-lg font-semibold text-danger">
            {t("sellQrExpired")}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setQr(null);
            setQty({});
          }}
          className="h-12 w-full rounded-full bg-[var(--evoly-charbon)] font-semibold text-[var(--evoly-creme)]"
        >
          {t("sellQrNew")}
        </button>
      </section>
    );
  }
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
      {sale.options?.length ? (
        <ul className="grid gap-2" aria-label={t("sellOptions")}>
          {sale.options.map((o) => {
            const n = qty[o.id] ?? 0;
            return (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <div className="grid">
                  <span className="font-semibold">{o.name}</span>
                  <span className="text-sm tabular-nums">{(left[o.id] ?? 0) > 0 ? money(o.priceMinor) : t("sellSoldOut")}</span>
                </div>
                <div className="flex items-center gap-2" role="group" aria-label={o.name}>
                  <button
                    type="button"
                    onClick={() => set(o.id, n - 1)}
                    disabled={n === 0}
                    className="size-11 rounded-full text-lg font-semibold ring-1 ring-[var(--evoly-charbon)] disabled:opacity-40"
                    aria-label={`− ${o.name}`}
                  >
                    −
                  </button>
                  <output className="w-8 text-center font-display text-lg tabular-nums">{n}</output>
                  <button
                    type="button"
                    onClick={() => set(o.id, n + 1)}
                    disabled={n >= (left[o.id] ?? 0)}
                    className="size-11 rounded-full bg-[var(--evoly-charbon)] text-lg font-semibold text-[var(--evoly-creme)] disabled:opacity-40"
                    aria-label={`+ ${o.name}`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {result?.ok && result.passCode ? (
        <p role="status" className="rounded-md bg-[var(--evoly-creme)] p-3 text-center">
          <span className="block text-sm">{t("sellPassCode")}</span>
          <span className="font-mono text-2xl tracking-[0.2em]">{result.passCode}</span>
        </p>
      ) : null}
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
      <button
        type="button"
        onClick={startQr}
        disabled={pending || count === 0}
        className="h-12 rounded-full font-semibold ring-1 ring-[var(--evoly-charbon)] disabled:opacity-40"
      >
        {t("sellQr", { amount: money(total) })}
      </button>
      {result?.ok ? (
        <p role="status" className="text-sm font-semibold">
          {result.tickets === 0 ? t("sellDoneOptions") : t("sellDone", { count: result.tickets })}
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
