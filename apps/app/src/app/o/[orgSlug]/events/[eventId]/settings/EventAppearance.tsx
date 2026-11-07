"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { buttonClass } from "@/components/ui/Button";
import { SettingsRow } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Field";
import { uploadFile } from "@/app/o/[orgSlug]/brand/BrandClient";
import {
  checkSubdomainAction,
  eventCoverAction,
  eventSubdomainAction,
} from "@/app/o/[orgSlug]/brand/actions";

/** Image de couverture et sous-domaine d'événement (Pro, US-BRD-05). */
export function EventAppearance({
  orgSlug,
  eventId,
  cover,
  subdomain,
  part,
  baseDomain,
  canSubdomain,
  protocol,
}: {
  orgSlug: string;
  eventId: string;
  cover: string | null;
  subdomain: string | null;
  /** Une seule partie : la couverture (Apparence, Images) ou le sous-domaine (Vente, Diffusion). */
  part?: "cover" | "subdomain";
  baseDomain: string;
  canSubdomain: boolean;
  protocol: string;
}) {
  const t = useTranslations("brand");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(subdomain ?? "");
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(
    null,
  );
  const { state, pending, formProps } = useActionForm(
    eventSubdomainAction.bind(null, orgSlug, eventId),
    null,
  );
  useEffect(() => {
    if (!value || value === subdomain) return setCheck(null);
    // une réponse qui ne correspond plus à la saisie est ignorée : sinon « disponible » pouvait s'afficher pour une autre adresse
    let current = true;
    const id = setTimeout(async () => {
      const r = await checkSubdomainAction(orgSlug, value, eventId);
      if (current) setCheck(r);
    }, 300);
    return () => {
      current = false;
      clearTimeout(id);
    };
  }, [value, subdomain, orgSlug, eventId]);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    // refonte A3 (maquette « Réglages de l'événement ») : une rangée par réglage, le titre et l'explication à gauche ; un
    // fragment, pour que les rangées s'enchaînent avec celles de la page (filets entre elles)
    <>
      {part !== "subdomain" ? (
        <SettingsRow title={t("coverTitle")} description={t("coverHint")}>
          {cover ? (
            <img
              src={cover}
              alt=""
              className="aspect-[3/1] w-full rounded-[10px] object-cover"
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={buttonClass(
                "secondary",
                "md",
                "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]",
              )}
            >
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
                  if (res.url)
                    await eventCoverAction(orgSlug, eventId, res.url);
                  else
                    setError(
                      t.has(`upload_${res.error}`)
                        ? t(`upload_${res.error}`)
                        : t("upload_UNKNOWN"),
                    );
                  setBusy(false);
                  router.refresh();
                }}
              />
            </label>
            {cover ? (
              <button
                type="button"
                className={buttonClass("ghost")}
                onClick={async () => {
                  await eventCoverAction(orgSlug, eventId, null);
                  router.refresh();
                }}
              >
                {t("removeCover")}
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
        </SettingsRow>
      ) : null}
      {part !== "cover" ? (
        <SettingsRow
          title={t("eventSubdomainTitle")}
          description={
            canSubdomain ? t("eventSubdomainHint") : t("eventSubdomainUpsell")
          }
        >
          {canSubdomain ? (
            <form {...formProps} className="grid gap-3.5" noValidate>
              <FormError state={state} />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  name="subdomain"
                  value={value}
                  onChange={(e) => setValue(e.target.value.toLowerCase())}
                  className="max-w-[16rem]"
                  aria-label={t("eventSubdomainTitle")}
                />
                <span className="text-ink-muted">.{baseDomain}</span>
              </div>
              {check ? (
                <p
                  className={`text-[13px] ${check.ok ? "text-success" : "text-danger"}`}
                >
                  {check.ok ? t("available") : t(`unavailable_${check.reason}`)}
                </p>
              ) : null}
              {subdomain ? (
                <p className="text-[13px]">
                  {t("eventSubdomainActive")}{" "}
                  <a
                    href={`${protocol}//${subdomain}.${baseDomain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    {subdomain}.{baseDomain}
                  </a>
                </p>
              ) : null}
              {/* « Retirer » seulement s'il y a un sous-domaine à retirer */}
              <SubmitButton pending={pending}>
                {!value && subdomain
                  ? t("eventSubdomainRemove")
                  : t("eventSubdomainSave")}
              </SubmitButton>
            </form>
          ) : (
            <div>
              <a
                href={`/o/${orgSlug}/billing`}
                className={buttonClass("primary")}
              >
                {t("upgradePro")}
              </a>
            </div>
          )}
        </SettingsRow>
      ) : null}
    </>
  );
}
