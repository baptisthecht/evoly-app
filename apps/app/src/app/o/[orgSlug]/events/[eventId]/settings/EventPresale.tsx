"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { generatePresaleCodesAction, savePresaleStartAction, setPresaleCodeActiveAction } from "@/app/o/[orgSlug]/events/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";

type Code = { id: string; code: string; label: string | null; maxUses: number; usedCount: number; active: boolean };
type Props = {
  orgSlug: string;
  eventId: string;
  timezone: string;
  startsLocal: string | null;
  overview: { codes: Code[]; count: number; used: number; capacity: number };
  eventUrl: string;
  csvUrl: string;
  readOnly: boolean;
};

/** Prévente privée (RG-PRV-01, RG-PRV-02) : N codes utilisables X fois chacun, début facultatif, export et désactivation. */
export function EventPresale(p: Props) {
  const t = useTranslations("presale");
  const te = useTranslations("errors");
  const [start, setStart] = useState(p.startsLocal ?? "");
  const [quantity, setQuantity] = useState(1);
  const [uses, setUses] = useState(1);
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const fail = (code: string) => (code && te.has(code) ? te(code) : t("error"));
  const n = Math.max(1, Math.min(5000, Math.trunc(quantity) || 1));
  const u = Math.max(1, Math.min(100_000, Math.trunc(uses) || 1));
  const generate = () =>
    run(async () => {
      const r = await generatePresaleCodesAction(p.orgSlug, p.eventId, {
        quantity: n,
        usesPerCode: u,
        customCode: n === 1 && custom.trim() ? custom.trim() : null,
        label: label.trim() || null,
      });
      if (r?.ok) {
        setMsg({ ok: true, text: t("generated", { count: Number(r.data) }) });
        setCustom("");
      } else setMsg({ ok: false, text: fail(r && !r.ok ? r.error : "") });
    });
  const saveStart = () =>
    run(async () => {
      const r = await savePresaleStartAction(p.orgSlug, p.eventId, start || null);
      setMsg(r?.ok ? { ok: true, text: t("saved") } : { ok: false, text: fail(r && !r.ok ? r.error : "") });
    });
  const toggle = (c: Code) =>
    run(async () => {
      const r = await setPresaleCodeActiveAction(p.orgSlug, p.eventId, c.id, !c.active);
      if (r && !r.ok) setMsg({ ok: false, text: fail(r.error) });
    });
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(`${p.eventUrl}?prevente=${encodeURIComponent(code)}`);
    setCopied(code);
    window.setTimeout(() => setCopied(null), 2000);
  };
  return (
    <Card className="mt-6">
      <div className="grid gap-5">
        <div className="grid gap-1">
          <h2 className="font-display text-xl tracking-[-0.02em]">{t("title")}</h2>
          <p className="text-sm text-ink-muted">{t("intro")}</p>
        </div>
        <fieldset className="grid gap-2" disabled={p.readOnly}>
          <Field label={t("startLabel", { tz: p.timezone })} htmlFor="presaleStart" hint={t("startHint")}>
            <Input id="presaleStart" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          {!p.readOnly ? (
            <div>
              <Button type="button" variant="secondary" onClick={saveStart} disabled={pending}>
                {t("saveStart")}
              </Button>
            </div>
          ) : null}
        </fieldset>
        {!p.readOnly ? (
          <fieldset className="grid gap-3 border-t border-line pt-4">
            <legend className="mb-1 text-sm font-semibold">{t("generateTitle")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("quantityLabel")} htmlFor="presaleQuantity">
                <Input id="presaleQuantity" type="number" min={1} max={5000} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
              </Field>
              <Field label={t("usesLabel")} htmlFor="presaleUses">
                <Input id="presaleUses" type="number" min={1} max={100000} value={uses} onChange={(e) => setUses(Number(e.target.value))} />
              </Field>
            </div>
            {n === 1 ? (
              <Field label={t("customLabel")} htmlFor="presaleCustom" hint={t("customHint")}>
                <Input id="presaleCustom" type="text" maxLength={30} value={custom} onChange={(e) => setCustom(e.target.value.toUpperCase())} />
              </Field>
            ) : null}
            <Field label={t("labelLabel")} htmlFor="presaleLabel" hint={t("labelHint")}>
              <Input id="presaleLabel" type="text" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <p className="text-sm text-ink-muted">{t("summary", { quantity: n, uses: u })}</p>
            <div>
              <Button type="button" onClick={generate} disabled={pending}>
                {t("generate")}
              </Button>
            </div>
          </fieldset>
        ) : null}
        {msg ? (
          <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>
            {msg.text}
          </p>
        ) : null}
        <div className="grid gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {p.overview.count === 0 ? t("none") : t("stats", { count: p.overview.count, used: p.overview.used, capacity: p.overview.capacity })}
            </p>
            {p.overview.count > 0 ? (
              <a href={p.csvUrl} className="text-sm underline underline-offset-4">
                {t("export")}
              </a>
            ) : null}
          </div>
          {p.overview.codes.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-ink-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">{t("colCode")}</th>
                      <th className="py-2 pr-3 font-medium">{t("colLabel")}</th>
                      <th className="py-2 pr-3 font-medium">{t("colUses")}</th>
                      <th className="py-2 font-medium">
                        <span className="sr-only">{t("colActions")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.overview.codes.map((c) => (
                      <tr key={c.id} className={`border-t border-line ${c.active ? "" : "text-ink-muted"}`}>
                        <td className="py-2 pr-3 font-semibold tracking-wide">
                          {c.code}
                          {c.active ? null : <span className="ml-2 text-xs font-normal">({t("disabled")})</span>}
                        </td>
                        <td className="py-2 pr-3">{c.label ?? ""}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {c.usedCount} / {c.maxUses}
                        </td>
                        <td className="flex flex-wrap justify-end gap-3 py-2">
                          <button type="button" className="underline underline-offset-4" onClick={() => copy(c.code)}>
                            {copied === c.code ? t("copied") : t("copyLink")}
                          </button>
                          {!p.readOnly ? (
                            <button type="button" className="underline underline-offset-4" onClick={() => toggle(c)} disabled={pending}>
                              {c.active ? t("disable") : t("enable")}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.overview.count > p.overview.codes.length ? <p className="text-xs text-ink-muted">{t("latest")}</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
