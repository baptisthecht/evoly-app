import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/Brand";
import { participantEmail, participantOverview } from "@/server/participant";
import { logoutAction, preferenceAction } from "./actions";
import { LinkForm } from "./LinkForm";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("participant"))("title"), robots: { index: false, follow: false } };
}

const card = "rounded-[var(--r-card)] bg-surface-raised p-5 shadow-sm ring-1 ring-line";

/** Section 9.23 : espace participant (compte facultatif, lien de connexion par e-mail). */
export default async function ParticipantSpace({ searchParams }: { searchParams: Promise<{ lien?: string }> }) {
  const t = await getTranslations("participant");
  const locale = (await getLocale()) as Locale;
  const email = await participantEmail();
  const expired = (await searchParams).lien === "expire";
  if (!email)
    return (
      <main className="grid min-h-dvh place-items-center bg-surface px-5 py-10">
        <div className="grid w-full max-w-sm gap-5 rounded-[var(--r-panel)] bg-surface-raised p-6 shadow-md ring-1 ring-line">
          <Logo className="h-8 w-auto" />
          <h1 className="font-display text-2xl tracking-[-0.03em]">{t("title")}</h1>
          <p className="text-ink-muted">{t("intro")}</p>
          {expired ? <p role="alert" className="text-sm text-danger">{t("expired")}</p> : null}
          <LinkForm />
        </div>
      </main>
    );
  const data = await participantOverview(email);
  const Section = ({ title, rows }: { title: string; rows: typeof data.upcoming }) => (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="font-display text-xl tracking-[-0.02em]">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-ink-muted">{t("none")}</p> : null}
      <ul className="grid gap-2">
        {rows.map((o) => (
          <li key={o.id}>
            <a href={o.url} className={`${card} grid gap-1 transition-shadow hover:shadow-md`}>
              <span className="text-xs font-semibold text-ink-muted">{o.organization}</span>
              <span className="font-semibold">{o.title}</span>
              <span className="text-sm text-ink-muted">{formatDateTime(o.startsAt, o.timezone, locale, "long")}{o.place ? ` · ${o.place}` : ""}</span>
              <span className="text-sm">{o.cancelled ? t("cancelled") : o.refunded ? t("refunded") : t("tickets", { count: o.tickets })} · {o.reference}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <main className="min-h-dvh bg-surface px-5 py-8">
      <div className="mx-auto grid max-w-2xl gap-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Logo className="h-8 w-auto" />
          <form action={logoutAction}>
            <button type="submit" className="text-sm font-semibold underline underline-offset-4">{t("logout")}</button>
          </form>
        </header>
        <div className="grid gap-1">
          <h1 className="font-display text-3xl tracking-[-0.04em]">{t("title")}</h1>
          <p className="text-ink-muted">{t("signedAs", { email })}</p>
        </div>
        <Section title={t("upcoming")} rows={data.upcoming} />
        {data.listings.length ? (
          <section className="grid gap-3" aria-label={t("resales")}>
            <h2 className="font-display text-xl tracking-[-0.02em]">{t("resales")}</h2>
            <ul className="grid gap-2">
              {data.listings.map((l) => (
                <li key={l.id} className={`${card} flex flex-wrap justify-between gap-2 text-sm`}>
                  <span className="font-semibold">{l.title}</span>
                  <span>{formatMoney(l.priceMinor, l.currency, locale)} · {t(`listing_${l.status}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Section title={t("past")} rows={data.past} />
        <section className="grid gap-3" aria-label={t("preferences")}>
          <h2 className="font-display text-xl tracking-[-0.02em]">{t("preferences")}</h2>
          <p className="text-sm text-ink-muted">{t("preferencesIntro")}</p>
          <ul className="grid gap-2">
            {data.preferences.map((p) => (
              <li key={p.organizationId} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                <span>
                  <span className="block font-semibold">{p.organization}</span>
                  <span className="text-sm text-ink-muted">{p.marketing ? t("subscribed") : t("unsubscribed")}</span>
                </span>
                <form action={preferenceAction.bind(null, p.organizationId, !p.marketing)}>
                  <button type="submit" className="rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]">
                    {p.marketing ? t("unsubscribe") : t("subscribe")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
