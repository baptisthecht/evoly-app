"use client";

import type { FeeTerms } from "@evoly/core";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { saveTiersAction } from "../../actions";
import { PriceFields } from "./PriceFields";

export interface TierRow {
  id: string | null;
  name: string;
  price: string;
  startsAtLocal: string;
  endsAtLocal: string;
  quantityLimit: string;
  sold: number;
}

/** Prix dynamiques (US-TKT-03, Pro) : prévente, normal, dernière minute… par date ou par quantité. */
export function TiersEditor({
  orgSlug,
  eventId,
  ticketTypeId,
  initial,
  enabled,
  locked,
  terms,
}: {
  orgSlug: string;
  eventId: string;
  ticketTypeId: string;
  initial: TierRow[];
  enabled: boolean;
  locked: boolean;
  terms: FeeTerms;
}) {
  const t = useTranslations("tiers");
  const tf = useTranslations();
  const locale = useLocale();
  const [rows, setRows] = useState<TierRow[]>(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  if (!enabled && initial.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-accent px-4 py-3">
        <p className="text-sm">{t("proPitch")}</p>
        <Badge tone="dark">Pro</Badge>
      </div>
    );
  }
  const readOnly = !enabled || locked;
  const update = (i: number, patch: Partial<TierRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  return (
    <section className="grid gap-4" aria-labelledby={`tiers-${ticketTypeId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`tiers-${ticketTypeId}`} className="font-display text-lg tracking-[var(--tracking-title)]">
          {t("title")}
        </h4>
        {readOnly ? <Badge>{t(enabled ? "lockedBadge" : "keptAfterDowngrade")}</Badge> : null}
      </div>
      <p className="-mt-2 text-sm text-ink-muted">{t("intro")}</p>
      <ol className="grid gap-3">
        {rows.map((row, i) => (
          <li key={row.id ?? `new-${i}`} className="grid gap-3 rounded-md bg-surface-sunken p-4">
            <label className="grid gap-1 text-xs font-bold">
              {t("name")}
              <Input placeholder={t("namePlaceholder")} value={row.name} onChange={(e) => update(i, { name: e.target.value })} readOnly={readOnly} />
            </label>
            <PriceFields
              compact
              id={`tier-${ticketTypeId}-${i}-price`}
              label={t("price")}
              price={row.price}
              onPrice={(v) => update(i, { price: v })}
              terms={terms}
              locked={readOnly || row.sold > 0}
            />
            <div className="grid items-end gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-xs font-bold">
                {t("from")}
                <Input type="datetime-local" value={row.startsAtLocal} onChange={(e) => update(i, { startsAtLocal: e.target.value })} readOnly={readOnly} />
              </label>
              <label className="grid gap-1 text-xs font-bold">
                {t("until")}
                <Input type="datetime-local" value={row.endsAtLocal} onChange={(e) => update(i, { endsAtLocal: e.target.value })} readOnly={readOnly} />
              </label>
              <label className="grid gap-1 text-xs font-bold">
                {t("limit")}
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={row.quantityLimit}
                  onChange={(e) => update(i, { quantityLimit: e.target.value })}
                  readOnly={readOnly}
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
              <span>{row.sold > 0 ? t("soldOnTier", { count: row.sold }) : t("noSales")}</span>
              {!readOnly && row.sold === 0 ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                  {t("remove")}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {!readOnly ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRows((r) => [...r, { id: null, name: "", price: "", startsAtLocal: "", endsAtLocal: "", quantityLimit: "", sold: 0 }])}
            disabled={rows.length >= 10}
          >
            {t("add")}
          </Button>
          <Button
            type="button"
            variant="dark"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveTiersAction(
                  orgSlug,
                  eventId,
                  ticketTypeId,
                  rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    price: r.price,
                    startsAtLocal: r.startsAtLocal || null,
                    endsAtLocal: r.endsAtLocal || null,
                    quantityLimit: r.quantityLimit || null,
                  })),
                );
                if (res?.ok) {
                  const issues = res.data.issues;
                  setMessage(
                    issues.length
                      ? { tone: "warn", text: issues.map((x) => t(x.kind === "GAP" ? "gap" : "overlap", { from: fmt(x.from), to: fmt(x.to) })).join(" ") }
                      : { tone: "ok", text: t("saved") },
                  );
                } else if (res) {
                  setMessage({ tone: "error", text: tf.has(`formErrors.${res.error}`) ? tf(`formErrors.${res.error}`) : tf("formErrors.generic") });
                }
              })
            }
          >
            {pending ? tf("common.saving") : t("save")}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className={
            message.tone === "ok"
              ? "text-sm text-success"
              : message.tone === "warn"
                ? "rounded-md bg-warning-soft px-4 py-3 text-sm text-warning"
                : "rounded-md bg-danger-soft px-4 py-3 text-sm text-danger"
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
