"use client";

import { palette } from "@evoly/ui";

import { dominantColors } from "@evoly/core";
import { contrastRatio, inkOn } from "@evoly/ui";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { addDomainAction, changeSubdomainAction, checkSubdomainAction, domainCommandAction, saveBrandAction } from "./actions";

/** Import d'une image vers la route d'import, renvoie son adresse publique. */
export async function uploadFile(orgSlug: string, file: File, kind: "logo" | "favicon" | "cover" | "campaign", eventId?: string): Promise<{ url?: string; error?: string }> {
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);
  if (eventId) body.set("eventId", eventId);
  const res = await fetch(`/o/${orgSlug}/brand/upload`, { method: "POST", body });
  return res.json();
}

async function colorsOf(url: string): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 96 / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return dominantColors(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

export function SubdomainForm({ orgSlug, current, baseDomain }: { orgSlug: string; current: string; baseDomain: string }) {
  const t = useTranslations("brand");
  const [value, setValue] = useState(current);
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  const { state, pending, formProps } = useActionForm(changeSubdomainAction.bind(null, orgSlug), null);
  useEffect(() => {
    if (value === current) return setCheck(null);
    const id = setTimeout(async () => setCheck(await checkSubdomainAction(orgSlug, value)), 300);
    return () => clearTimeout(id);
  }, [value, current, orgSlug]);
  return (
    <form {...formProps} className="grid gap-3" noValidate>
      <FormError state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <Input name="subdomain" value={value} onChange={(e) => setValue(e.target.value.toLowerCase())} className="max-w-[16rem] font-mono" aria-label={t("subdomain")} />
        <span className="font-mono text-sm text-ink-muted">.{baseDomain}</span>
      </div>
      {check ? <p className={`text-sm ${check.ok ? "text-success" : "text-danger"}`}>{check.ok ? t("available") : t(`unavailable_${check.reason}`)}</p> : null}
      {value !== current ? <p className="text-sm text-ink-muted">{t("redirectNotice", { old: `${current}.${baseDomain}` })}</p> : null}
      {state?.ok ? <p className="text-sm text-success" role="status">{t("subdomainChanged")}</p> : null}
      <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
        {t("changeSubdomain")}
      </SubmitButton>
    </form>
  );
}

export interface BrandValues {
  displayName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  emailFromName: string;
  emailReplyTo: string;
  hideEvolyBranding: boolean;
}

/** US-BRD-01, US-BRD-02 : configurateur avec aperçu en direct et contraste contrôlé (RG-BRD-01). */
export function BrandForm({ orgSlug, values, organizationName, canHide }: { orgSlug: string; values: BrandValues; organizationName: string; canHide: boolean }) {
  const t = useTranslations("brand");
  const [v, setV] = useState(values);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { state, pending, formProps } = useActionForm(saveBrandAction.bind(null, orgSlug), null);
  const error = useFieldError(state);
  const set = (patch: Partial<BrandValues>) => setV((x) => ({ ...x, ...patch }));
  const primary = /^#[0-9a-fA-F]{6}$/.test(v.primaryColor) ? v.primaryColor : palette.charbon;
  const accent = /^#[0-9a-fA-F]{6}$/.test(v.accentColor) ? v.accentColor : palette.rose;
  const upload = async (file: File | undefined, kind: "logo" | "favicon") => {
    if (!file) return;
    setBusy(kind);
    setUploadError(null);
    const res = await uploadFile(orgSlug, file, kind);
    setBusy(null);
    if (!res.url) return setUploadError(t.has(`upload_${res.error}`) ? t(`upload_${res.error}`) : t("upload_UNKNOWN"));
    set(kind === "logo" ? { logoUrl: res.url } : { faviconUrl: res.url });
    if (kind === "logo") {
      const colors = await colorsOf(res.url).catch(() => []);
      setSuggested(colors);
      if (colors[0] && !values.primaryColor) set({ primaryColor: colors[0], ...(colors[1] ? { accentColor: colors[1] } : {}) });
    }
  };
  const ratio = (c: string) => Math.round(contrastRatio(c, inkOn(c)) * 10) / 10;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <form {...formProps} className="grid content-start gap-5" noValidate>
        <FormError state={state} />
        <input type="hidden" name="logoUrl" value={v.logoUrl} />
        <input type="hidden" name="faviconUrl" value={v.faviconUrl} />
        <Field label={t("displayName")} htmlFor="displayName" hint={t("displayNameHint")}>
          <Input id="displayName" name="displayName" value={v.displayName} onChange={(e) => set({ displayName: e.target.value })} placeholder={organizationName} maxLength={80} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <p className="font-label text-[0.8rem] font-bold">{t("logo")}</p>
            {v.logoUrl ? <img src={v.logoUrl} alt={t("logoAlt")} className="h-16 w-auto justify-self-start rounded-md bg-surface-sunken object-contain p-2" /> : null}
            <label className="w-fit cursor-pointer rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]">
              {busy === "logo" ? t("uploading") : v.logoUrl ? t("replaceLogo") : t("uploadLogo")}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => upload(e.target.files?.[0], "logo")} data-testid="logo-input" />
            </label>
            {v.logoUrl ? (
              <button type="button" className="w-fit text-sm underline underline-offset-4" onClick={() => set({ logoUrl: "" })}>
                {t("removeLogo")}
              </button>
            ) : null}
            <p className="text-xs text-ink-muted">{t("logoHint")}</p>
          </div>
          <div className="grid content-start gap-2">
            <p className="font-label text-[0.8rem] font-bold">{t("favicon")}</p>
            {v.faviconUrl ? <img src={v.faviconUrl} alt="" className="size-10 rounded-md bg-surface-sunken object-contain p-1" /> : null}
            <label className="w-fit cursor-pointer rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]">
              {busy === "favicon" ? t("uploading") : t("uploadFavicon")}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => upload(e.target.files?.[0], "favicon")} />
            </label>
          </div>
        </div>
        {uploadError ? <p role="alert" className="text-sm text-danger">{uploadError}</p> : null}
        {suggested.length > 0 ? (
          <div className="grid gap-2">
            <p className="text-sm">{t("suggested")}</p>
            <div className="flex flex-wrap gap-2">
              {suggested.map((c, i) => (
                <button key={c} type="button" onClick={() => set(i === 0 ? { primaryColor: c } : { accentColor: c })} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-line-strong">
                  <span className="size-4 rounded-full ring-1 ring-line" style={{ background: c }} aria-hidden="true" />
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          {(["primaryColor", "accentColor"] as const).map((k) => (
            <Field key={k} label={t(k)} htmlFor={k} hint={t("contrast", { ratio: ratio(k === "primaryColor" ? primary : accent) })} error={error(k)}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={t(k)} value={k === "primaryColor" ? primary : accent} onChange={(e) => set({ [k]: e.target.value.toUpperCase() })} className="size-11 cursor-pointer rounded-md bg-transparent" />
                <Input id={k} name={k} value={v[k]} onChange={(e) => set({ [k]: e.target.value })} placeholder={k === "primaryColor" ? palette.charbon : palette.rose} className="font-mono" maxLength={9} />
              </div>
            </Field>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("emailFromName")} htmlFor="emailFromName" hint={t("emailFromNameHint")}>
            <Input id="emailFromName" name="emailFromName" value={v.emailFromName} onChange={(e) => set({ emailFromName: e.target.value })} placeholder={organizationName} maxLength={80} />
          </Field>
          <Field label={t("emailReplyTo")} htmlFor="emailReplyTo" error={error("emailReplyTo")}>
            <Input id="emailReplyTo" name="emailReplyTo" type="email" value={v.emailReplyTo} onChange={(e) => set({ emailReplyTo: e.target.value })} />
          </Field>
        </div>
        {canHide ? (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="hideEvolyBranding" checked={v.hideEvolyBranding} onChange={(e) => set({ hideEvolyBranding: e.target.checked })} className="size-5 accent-[var(--ink)]" />
            {t("hideEvolyBranding")}
          </label>
        ) : null}
        {state?.ok ? <p className="text-sm text-success" role="status">{t("saved")}</p> : null}
        <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
          {t("save")}
        </SubmitButton>
      </form>
      <aside aria-label={t("preview")} className="grid content-start gap-2 lg:sticky lg:top-6">
        <p className="font-label text-[0.8rem] font-bold text-ink-muted">{t("preview")}</p>
        <div className="overflow-hidden rounded-lg ring-1 ring-line" data-testid="brand-preview">
          <div className="flex items-center justify-between gap-2 bg-surface px-4 py-3">
            {v.logoUrl ? <img src={v.logoUrl} alt="" className="h-7 w-auto" /> : <span className="font-display">{v.displayName || organizationName}</span>}
            {!v.hideEvolyBranding || !canHide ? <span className="text-[0.65rem] text-ink-muted">{t("poweredBy")}</span> : null}
          </div>
          <div className="grid gap-2 px-4 py-6" style={{ background: primary, color: inkOn(primary) }}>
            <span className="w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-bold" style={{ background: accent, color: inkOn(accent) }}>
              {t("previewDate")}
            </span>
            <span className="font-display text-2xl leading-none tracking-[-0.04em]">{t("previewTitle")}</span>
          </div>
          <div className="grid gap-2 bg-surface-raised p-4">
            <span className="text-sm font-semibold">{t("previewTicket")}</span>
            <span className="rounded-full py-2.5 text-center text-sm font-semibold" style={{ background: accent, color: inkOn(accent) }}>
              {t("previewButton")}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function AddDomain({ orgSlug, events }: { orgSlug: string; events: Array<{ id: string; title: string }> }) {
  const t = useTranslations("brand");
  const { state, pending, formProps } = useActionForm(addDomainAction.bind(null, orgSlug), null);
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end" noValidate>
      <Field label={t("domain")} htmlFor="new-domain" hint={t("domainHint")}>
        <Input id="new-domain" name="domain" placeholder="billetterie.monsite.be" autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field label={t("scope")} htmlFor="domain-target">
        <Select id="domain-target" name="target" defaultValue="ORGANIZATION">
          <option value="ORGANIZATION">{t("scopeOrganization")}</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {t("scopeEvent", { title: e.title })}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton pending={pending} className="w-full sm:w-auto">
        {t("addDomain")}
      </SubmitButton>
      <div className="sm:col-span-3">
        <FormError state={state} />
      </div>
    </form>
  );
}

export function DomainRow({ orgSlug, d, planOk }: { orgSlug: string; d: { id: string; domain: string; status: string; dnsTarget: string; lastError: string | null; target: string; checksStopped: boolean }; planOk: boolean }) {
  const t = useTranslations("brand");
  const [verifyState, verify, verifying] = useActionState(domainCommandAction.bind(null, orgSlug, d.id, "verify"), null);
  const [removeState, remove] = useActionState(domainCommandAction.bind(null, orgSlug, d.id, "remove"), null);
  const status = !planOk ? "DISABLED" : d.status;
  const tone = status === "ACTIVE" ? "success" : status === "PENDING_DNS" ? "warning" : status === "ERROR" ? "danger" : "neutral";
  const errorCode = d.lastError?.split(":")[0];
  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono font-semibold">{d.domain}</p>
        <Badge tone={tone}>{t(`domain_${status}`)}</Badge>
        <span className="text-sm text-ink-muted">{d.target}</span>
      </div>
      {d.status !== "ACTIVE" ? (
        <div className="grid gap-2 rounded-md bg-surface-sunken p-3 text-sm">
          <p>{t("dnsInstructions")}</p>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 font-mono text-xs">
            <span className="font-sans font-bold">{t("dnsType")}</span>
            <span>CNAME</span>
            <span />
            <span className="font-sans font-bold">{t("dnsName")}</span>
            <span className="truncate">{d.domain}</span>
            <CopyButton value={d.domain} />
            <span className="font-sans font-bold">{t("dnsValue")}</span>
            <span className="truncate">{d.dnsTarget}</span>
            <CopyButton value={d.dnsTarget} />
          </div>
          {errorCode ? <p className="text-danger">{t(`dnsError_${errorCode}`, { found: d.lastError?.split(":")[1] ?? "" })}</p> : null}
          {d.checksStopped ? <p className="text-ink-muted">{t("checksStopped")}</p> : <p className="text-ink-muted">{t("autoChecks")}</p>}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {d.status !== "ACTIVE" ? (
          <form action={verify}>
            <Button type="submit" size="sm" variant="dark" disabled={verifying}>
              {t("verifyNow")}
            </Button>
          </form>
        ) : null}
        <form action={remove} onSubmit={(e) => (window.confirm(t("confirmRemove", { domain: d.domain })) ? undefined : e.preventDefault())}>
          <Button type="submit" size="sm" variant="ghost">
            {t("removeDomain")}
          </Button>
        </form>
      </div>
      <FormError state={verifyState ?? removeState} />
    </Card>
  );
}
