import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { waitlistByToken } from "@/server/waitlist";
import { leaveWaitlistAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Liste d'attente", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Désinscription de la liste d'attente : un bouton à confirmer, pour que les antivirus qui ouvrent les liens ne désinscrivent personne. */
export default async function WaitlistPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const t = await getTranslations("public");
  const entry = done ? null : await waitlistByToken(token.slice(0, 60));
  const active = entry && (entry.status === "WAITING" || entry.status === "OFFERED");
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-6 py-16 text-ink">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        {done ? (
          <p role="status" className="text-lg">
            {t("waitlistUnsubDone")}
          </p>
        ) : active ? (
          <>
            <h1 className="font-display text-3xl tracking-[-0.03em]">{t("waitlistUnsubTitle")}</h1>
            <p className="text-ink-muted">{t("waitlistUnsubText", { ticket: entry.ticketType.name, event: entry.event.title })}</p>
            <form action={leaveWaitlistAction.bind(null, token)}>
              <button type="submit" className={buttonClass("primary")}>
                {t("waitlistUnsubButton")}
              </button>
            </form>
          </>
        ) : (
          <p className="text-lg">{t("waitlistUnsubGone")}</p>
        )}
      </div>
    </main>
  );
}
