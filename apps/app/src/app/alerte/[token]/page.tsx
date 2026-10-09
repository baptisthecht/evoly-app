import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { alertByToken } from "@/server/alerts";
import { unsubscribeAlertAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alerte", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Suppression d'une alerte « Prévenez-moi » : un bouton à confirmer, pour que les antivirus qui ouvrent les liens ne désinscrivent personne. */
export default async function AlertPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const t = await getTranslations("public");
  const alert = done ? null : await alertByToken(token.slice(0, 40));
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-6 py-16 text-ink">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        {done ? (
          <p role="status" className="text-lg">
            {t("alertUnsubDone")}
          </p>
        ) : alert ? (
          <>
            <h1 className="font-display text-3xl tracking-[-0.03em]">{t("alertUnsubTitle")}</h1>
            <p className="text-ink-muted">{t("alertUnsubText", { event: alert.event.title })}</p>
            <form action={unsubscribeAlertAction.bind(null, token)}>
              <button type="submit" className={buttonClass("primary")}>
                {t("alertUnsubButton")}
              </button>
            </form>
          </>
        ) : (
          <p className="text-lg">{t("alertUnsubGone")}</p>
        )}
      </div>
    </main>
  );
}
