"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  generatePresaleCodesAction,
  savePresaleStartAction,
  setPresaleCodeActiveAction,
} from "@/app/o/[orgSlug]/events/actions";
import { Button, buttonClass } from "@/components/ui/Button";
import { ExampleNote, SavedNote, SettingsRow } from "@/components/ui/Controls";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Field, Input } from "@/components/ui/Field";
import { DownloadIcon } from "@/components/ui/icons";

type Code = {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  active: boolean;
};
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
  const locale = useLocale();
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
      const r = await savePresaleStartAction(
        p.orgSlug,
        p.eventId,
        start || null,
      );
      setMsg(
        r?.ok
          ? { ok: true, text: t("saved") }
          : { ok: false, text: fail(r && !r.ok ? r.error : "") },
      );
    });
  const toggle = (c: Code) =>
    run(async () => {
      const r = await setPresaleCodeActiveAction(
        p.orgSlug,
        p.eventId,
        c.id,
        !c.active,
      );
      if (r && !r.ok) setMsg({ ok: false, text: fail(r.error) });
    });
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(
      `${p.eventUrl}?prevente=${encodeURIComponent(code)}`,
    );
    setCopied(code);
    window.setTimeout(() => setCopied(null), 2000);
  };
  // refonte A3 (maquette « Réglages de l'événement ») : trois rangées, la date, la création des codes, puis les codes
  const th =
    "border-b border-line px-2.5 py-[7px] text-left text-[12.5px] leading-[normal] font-medium whitespace-nowrap text-ink-muted";
  const td = "border-b border-line p-2.5 align-middle";
  const rowLink = "text-[13px] text-ink-muted hover:text-ink";
  return (
    <>
      <SettingsRow title={t("title")} description={t("intro")}>
        <fieldset className="grid gap-3.5" disabled={p.readOnly}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("startLabel", { tz: p.timezone })}
              htmlFor="presaleStart"
              hint={t("startHint")}
            >
              <DateTimeField
                id="presaleStart"
                locale={locale}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
          </div>
          {!p.readOnly ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={saveStart}
                disabled={pending}
              >
                {t("saveStart")}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </SettingsRow>
      {!p.readOnly ? (
        <SettingsRow title={t("generateTitle")} fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("quantityLabel")} htmlFor="presaleQuantity">
              <Input
                id="presaleQuantity"
                type="number"
                min={1}
                max={5000}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </Field>
            <Field label={t("usesLabel")} htmlFor="presaleUses">
              <Input
                id="presaleUses"
                type="number"
                min={1}
                max={100000}
                value={uses}
                onChange={(e) => setUses(Number(e.target.value))}
              />
            </Field>
          </div>
          {n === 1 ? (
            <Field
              label={t("customLabel")}
              htmlFor="presaleCustom"
              hint={t("customHint")}
            >
              <Input
                id="presaleCustom"
                type="text"
                maxLength={30}
                value={custom}
                onChange={(e) => setCustom(e.target.value.toUpperCase())}
              />
            </Field>
          ) : null}
          <Field
            label={t("labelLabel")}
            htmlFor="presaleLabel"
            hint={t("labelHint")}
          >
            <Input
              id="presaleLabel"
              type="text"
              maxLength={60}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <ExampleNote>{t("summary", { quantity: n, uses: u })}</ExampleNote>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={generate} disabled={pending}>
              {t("generate")}
            </Button>
            {msg ? (
              msg.ok ? (
                <SavedNote id="presale-status">{msg.text}</SavedNote>
              ) : (
                <p role="status" className="text-[13px] text-danger">
                  {msg.text}
                </p>
              )
            ) : null}
          </div>
        </SettingsRow>
      ) : null}
      <SettingsRow
        title={t("codesTitle")}
        description={
          p.overview.count === 0
            ? t("none")
            : t("stats", {
                count: p.overview.count,
                used: p.overview.used,
                capacity: p.overview.capacity,
              })
        }
      >
        {p.overview.codes.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t("colCode")}
                    </th>
                    <th scope="col" className={th}>
                      {t("colLabel")}
                    </th>
                    <th scope="col" className={`${th} text-right`}>
                      {t("colUses")}
                    </th>
                    <th scope="col" className={th}>
                      <span className="sr-only">{t("colActions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.overview.codes.map((c) => (
                    <tr key={c.id} className={c.active ? "" : "text-ink-muted"}>
                      <td className={`${td} font-medium tracking-wide`}>
                        {c.code}
                        {c.active ? null : (
                          <span className="ml-2 text-[12.5px] font-normal">
                            ({t("disabled")})
                          </span>
                        )}
                      </td>
                      <td className={td}>{c.label ?? ""}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {c.usedCount} / {c.maxUses}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        <span className="inline-flex gap-3">
                          <button
                            type="button"
                            className={rowLink}
                            onClick={() => copy(c.code)}
                          >
                            {copied === c.code ? t("copied") : t("copyLink")}
                          </button>
                          {!p.readOnly ? (
                            <button
                              type="button"
                              className={rowLink}
                              onClick={() => toggle(c)}
                              disabled={pending}
                            >
                              {c.active ? t("disable") : t("enable")}
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p.overview.count > p.overview.codes.length ? (
              <p className="text-[12.5px] text-ink-muted">{t("latest")}</p>
            ) : null}
          </>
        ) : null}
        {p.overview.count > 0 ? (
          <div>
            <a href={p.csvUrl} className={buttonClass("secondary")}>
              <DownloadIcon />
              {t("export")}
            </a>
          </div>
        ) : null}
      </SettingsRow>
    </>
  );
}
