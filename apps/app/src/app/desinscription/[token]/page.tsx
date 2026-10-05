import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Brand";
import { buttonClass } from "@/components/ui/Button";
import { db } from "@/lib/db";
import { applyUnsubscribe, readUnsubscribeToken } from "@/server/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Désinscription", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** US-MKT-05 et RG-MKT-02 : désinscription en un clic, sans connexion, de l'événement ou de l'organisation. */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const t = await getTranslations("unsubscribe");
  const data = readUnsubscribeToken(token);
  const [org, event] = data
    ? await Promise.all([
        db.organization.findUnique({ where: { id: data.organizationId }, select: { name: true } }),
        data.eventId ? db.event.findUnique({ where: { id: data.eventId }, select: { title: true } }) : null,
      ])
    : [null, null];
  async function unsubscribe(scope: "EVENT" | "ORGANIZATION") {
    "use server";
    await applyUnsubscribe(token, scope);
    const { redirect } = await import("next/navigation");
    redirect(`/desinscription/${token}?done=${scope.toLowerCase()}`);
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-5 py-10">
      <div className="grid w-full max-w-md gap-5 rounded-[var(--r-panel)] bg-surface-raised p-6 shadow-md ring-1 ring-line">
        <Logo className="h-8 w-auto" />
        {!data || !org ? (
          <p>{t("invalid")}</p>
        ) : done ? (
          <>
            <h1 className="font-display text-2xl tracking-[-0.03em]">{t("doneTitle")}</h1>
            <p className="text-ink-muted">
              {done === "event" && event ? t("doneEvent", { event: event.title }) : t("doneOrganization", { organization: org.name })}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl tracking-[-0.03em]">{t("title")}</h1>
            <p className="text-ink-muted">{t("intro", { email: data.email })}</p>
            <div className="grid gap-2">
              {event ? (
                <form action={unsubscribe.bind(null, "EVENT")}>
                  <button type="submit" className={buttonClass("secondary", "lg", "w-full")}>
                    {t("eventButton", { event: event.title })}
                  </button>
                </form>
              ) : null}
              <form action={unsubscribe.bind(null, "ORGANIZATION")}>
                <button type="submit" className={buttonClass("dark", "lg", "w-full")}>
                  {t("organizationButton", { organization: org.name })}
                </button>
              </form>
            </div>
            <p className="text-xs text-ink-muted">{t("transactional")}</p>
          </>
        )}
      </div>
    </main>
  );
}
