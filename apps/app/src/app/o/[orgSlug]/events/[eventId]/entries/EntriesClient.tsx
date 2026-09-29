"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { createScannerLinkAction, openScannerAction, revokeScannerLinkAction } from "../../actions";

export function OpenScanner({ orgSlug, eventId }: { orgSlug: string; eventId: string }) {
  const t = useTranslations("entries");
  const [state, action] = useActionState(openScannerAction.bind(null, orgSlug, eventId), null);
  return (
    <form action={action} className="grid gap-2">
      <SubmitButton variant="primary" className="w-full sm:w-auto">
        {t("openScanner")}
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}

export function NewScannerLink({ orgSlug, eventId }: { orgSlug: string; eventId: string }) {
  const t = useTranslations("entries");
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState("EVENT_DAY");
  const { state, pending, formProps } = useActionForm(createScannerLinkAction.bind(null, orgSlug, eventId), null);
  const error = useFieldError(state);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  if (!open)
    return (
      <Button type="button" variant="secondary" size="lg" className="justify-self-start" onClick={() => setOpen(true)}>
        + {t("newLink")}
      </Button>
    );
  return (
    <Card className="grid gap-5">
      <h3 className="font-display text-lg tracking-[var(--tracking-title)]">{t("newLink")}</h3>
      <form {...formProps} className="grid gap-5" noValidate>
        <FormError state={state} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("label")} htmlFor="link-label" hint={t("labelHint")} error={error("label")}>
            <Input id="link-label" name="label" maxLength={60} required />
          </Field>
          <Field label={t("duration")} htmlFor="link-duration">
            <Select id="link-duration" name="duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
              {(["EVENT_DAY", "24H", "48H", "CUSTOM"] as const).map((d) => (
                <option key={d} value={d}>
                  {t(`duration_${d}`)}
                </option>
              ))}
            </Select>
          </Field>
          {duration === "CUSTOM" ? (
            <Field label={t("expiresAt")} htmlFor="link-expiry" error={error("expiresAtLocal")}>
              <Input id="link-expiry" name="expiresAtLocal" type="datetime-local" required />
            </Field>
          ) : null}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="allowManualSearch" defaultChecked className="size-5 accent-[var(--ink)]" />
          {t("allowManualSearch")}
        </label>
        <div className="flex flex-wrap gap-3">
          <SubmitButton pending={pending} className="w-full sm:w-auto">
            {t("createLink")}
          </SubmitButton>
          <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function LinkActions({ orgSlug, eventId, linkId, url, qrSvg, active }: { orgSlug: string; eventId: string; linkId: string; url: string; qrSvg: string; active: boolean }) {
  const t = useTranslations("entries");
  const [state, action, pending] = useActionState(revokeScannerLinkAction.bind(null, orgSlug, eventId, linkId), null);
  const [qr, setQr] = useState(false);
  if (!active) return null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <CopyButton value={url} label={t("copyLink")} />
        <Button type="button" size="sm" variant="secondary" onClick={() => setQr((v) => !v)} aria-expanded={qr}>
          {t("showQr")}
        </Button>
        <form
          action={action}
          onSubmit={(e) => {
            if (!window.confirm(t("confirmRevoke"))) e.preventDefault();
          }}
        >
          <Button type="submit" size="sm" variant="ghost" className="text-danger" disabled={pending}>
            {t("revoke")}
          </Button>
        </form>
      </div>
      <FormError state={state} />
      {qr ? <div className="w-48 rounded-md bg-blanc p-2 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={t("qrLabel")} dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
    </div>
  );
}
