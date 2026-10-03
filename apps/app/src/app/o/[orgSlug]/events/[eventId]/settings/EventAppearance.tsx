"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { uploadFile } from "@/app/o/[orgSlug]/brand/BrandClient";
import { checkSubdomainAction, eventCoverAction, eventSubdomainAction } from "@/app/o/[orgSlug]/brand/actions";

/** Image de couverture et sous-domaine d'événement (Pro, US-BRD-05). */
export function EventAppearance({ orgSlug, eventId, cover, subdomain, baseDomain, canSubdomain, protocol }: { orgSlug: string; eventId: string; cover: string | null; subdomain: string | null; baseDomain: string; canSubdomain: boolean; protocol: string }) {
  const t = useTranslations("brand");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(subdomain ?? "");
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  const { state, pending, formProps } = useActionForm(eventSubdomainAction.bind(null, orgSlug, eventId), null);
  useEffect(() => {
    if (!value || value === subdomain) return setCheck(null);
    const id = setTimeout(async () => setCheck(await checkSubdomainAction(orgSlug, value, eventId)), 300);
    return () => clearTimeout(id);
  }, [value, subdomain, orgSlug, eventId]);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <div className="mt-10 grid gap-4">
      <Card className="grid gap-3">
        <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("coverTitle")}</h2>
        <p className="-mt-1 text-sm text-ink-muted">{t("coverHint")}</p>
        {cover ? <img src={cover} alt="" className="aspect-[3/1] w-full rounded-md object-cover" /> : null}
        <div className="flex flex-wrap gap-2">
          <label className="w-fit cursor-pointer rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]">
            {busy ? t("uploading") : t("uploadCover")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              data-testid="cover-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(null);
                const res = await uploadFile(orgSlug, file, "cover", eventId);
                if (res.url) await eventCoverAction(orgSlug, eventId, res.url);
                else setError(t.has(`upload_${res.error}`) ? t(`upload_${res.error}`) : t("upload_UNKNOWN"));
                setBusy(false);
                router.refresh();
              }}
            />
          </label>
          {cover ? (
            <button type="button" className="text-sm underline underline-offset-4" onClick={async () => { await eventCoverAction(orgSlug, eventId, null); router.refresh(); }}>
              {t("removeCover")}
            </button>
          ) : null}
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </Card>
      <Card className="grid gap-3">
        <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("eventSubdomainTitle")}</h2>
        {canSubdomain ? (
          <form {...formProps} className="grid gap-3" noValidate>
            <p className="-mt-1 text-sm text-ink-muted">{t("eventSubdomainHint")}</p>
            <FormError state={state} />
            <div className="flex flex-wrap items-center gap-2">
              <Input name="subdomain" value={value} onChange={(e) => setValue(e.target.value.toLowerCase())} className="max-w-[16rem] font-mono" aria-label={t("eventSubdomainTitle")} />
              <span className="font-mono text-sm text-ink-muted">.{baseDomain}</span>
            </div>
            {check ? <p className={`text-sm ${check.ok ? "text-success" : "text-danger"}`}>{check.ok ? t("available") : t(`unavailable_${check.reason}`)}</p> : null}
            {subdomain ? (
              <p className="text-sm">
                {t("eventSubdomainActive")}{" "}
                <a href={`${protocol}//${subdomain}.${baseDomain}`} target="_blank" rel="noreferrer" className="font-mono font-semibold underline underline-offset-4">
                  {subdomain}.{baseDomain}
                </a>
              </p>
            ) : null}
            {/* « Retirer » seulement s'il y a un sous-domaine à retirer */}
            <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
              {!value && subdomain ? t("eventSubdomainRemove") : t("eventSubdomainSave")}
            </SubmitButton>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-lilas px-2 py-0.5 font-label text-xs font-bold text-charbon">Pro</span>
            <p className="text-sm text-ink-muted">{t("eventSubdomainUpsell")}</p>
            <a href={`/o/${orgSlug}/billing`} className="inline-flex min-h-11 items-center rounded-full bg-surface-inverse px-5 font-label text-sm font-bold text-ink-inverse">
              {t("upgradePro")}
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
