import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ambassadorStats } from "@/server/ambassadors";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ambassadeur",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Lien privé d'un ambassadeur : ses ventes, son rang et le classement, sans compte et sans données d'acheteur (RG-AMB-04). */
export default async function AmbassadorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("ambassador");
  const s = await ambassadorStats(token);
  const locale = (await getLocale()) as Locale;
  if (!s) {
    return (
      <main className="grid min-h-dvh place-items-center bg-surface px-6 py-16 text-ink">
        <p className="text-lg">{t("gone")}</p>
      </main>
    );
  }
  return (
    <main className="min-h-dvh bg-surface px-6 py-12 text-ink">
      <div className="mx-auto grid max-w-md gap-6">
        <header className="grid gap-1">
          <p className="text-sm text-ink-muted">{s.event.title}</p>
          <h1 className="font-display text-3xl tracking-[-0.03em]">
            {t("title", { name: s.name })}
          </h1>
        </header>
        <section
          className="grid grid-cols-2 gap-3"
          aria-label={t("title", { name: s.name })}
        >
          <div className="rounded-lg bg-surface-raised p-4 ring-1 ring-line">
            <p className="text-sm text-ink-muted">{t("ticketsLabel")}</p>
            <p className="font-display text-3xl tabular-nums">{s.tickets}</p>
          </div>
          <div className="rounded-lg bg-surface-raised p-4 ring-1 ring-line">
            <p className="text-sm text-ink-muted">{t("rankLabel")}</p>
            <p className="font-display text-3xl tabular-nums">
              {t("rank", { rank: s.rank, total: s.total })}
            </p>
          </div>
        </section>
        <p className="text-sm">
          {t("amount", {
            amount: formatMoney(s.amountMinor, s.event.currency, locale, {
              trimZeroCents: true,
            }),
          })}
        </p>
        {s.goal ? (
          <p className="text-sm">
            {t("goal", { tickets: s.tickets, goal: s.goal })}
          </p>
        ) : null}
        {s.reward ? (
          <p className="text-sm font-semibold">
            {t("reward", { reward: s.reward })}
          </p>
        ) : null}
        <section className="grid gap-2" aria-label={t("leaderboard")}>
          <h2 className="font-semibold">{t("leaderboard")}</h2>
          <ol className="grid gap-1 text-sm">
            {s.leaderboard.map((r, i) => (
              <li
                key={`${r.name}-${i}`}
                className={`flex justify-between gap-3 rounded px-2 py-1 ${r.me ? "bg-surface-accent font-semibold" : ""}`}
              >
                <span>
                  {i + 1}. {r.name}
                  {r.me ? ` (${t("you")})` : ""}
                </span>
                <span className="tabular-nums">{r.tickets}</span>
              </li>
            ))}
          </ol>
        </section>
        <p className="text-xs text-ink-muted">{t("privacy")}</p>
      </div>
    </main>
  );
}
