import { getTranslations } from "next-intl/server";
import { OMark } from "../Brand";

/** RG-DOM-05 : domaine inconnu, en erreur ou désactivé : page Evoly, avec un lien vers l'adresse par défaut de l'organisation. */
export async function DisabledSite({ fallback }: { fallback: string | null }) {
  const t = await getTranslations("public");
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-6 text-center">
      <div className="grid max-w-md justify-items-center gap-4">
        <OMark className="size-14 text-ink" />
        <h1 className="font-display text-3xl tracking-[-0.04em]">{t("siteDisabledTitle")}</h1>
        <p className="text-ink-muted">{t("siteDisabledBody")}</p>
        {fallback ? (
          <a href={fallback} className="rounded-full bg-surface-inverse px-6 py-3 font-semibold text-ink-inverse">
            {t("siteDisabledLink")}
          </a>
        ) : null}
      </div>
    </main>
  );
}
