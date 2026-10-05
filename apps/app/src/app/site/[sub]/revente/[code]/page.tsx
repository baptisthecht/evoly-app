import { formatDate, formatMoney, formatTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/public/PublicShell";
import { ResaleBuy } from "@/components/public/ResaleBuy";
import { buttonClass } from "@/components/ui/Button";
import { getPublicOrganization } from "@/server/publicEvents";
import { getListingByCode } from "@/server/resale";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("resale");
  return { title: t("pageTitle"), robots: { index: false, follow: false } };
}

/** Page d'une annonce de revente (US-RSL-03) : evoly.me/r/[code] y redirige. */
export default async function ResaleListingPage({ params }: { params: Promise<{ sub: string; code: string }> }) {
  const { sub, code } = await params;
  if ((await siteGate(sub, `/revente/${code}`)).kind === "DISABLED") notFound();
  const org = await getPublicOrganization(sub);
  const listing = await getListingByCode(code);
  if (!org || !listing || listing.event.organizationId !== org.id) notFound();
  const t = await getTranslations("resale");
  const locale = (await getLocale()) as Locale;
  const now = new Date();
  const e = listing.event;
  const stale = listing.status === "RESERVED" && (!listing.reservedUntil || listing.reservedUntil <= now);
  const available = (listing.status === "ACTIVE" || stale) && listing.expiresAt > now && listing.ticket.status === "VALID" && e.resaleEnabled;
  const price = listing.priceMinor === 0 ? t("freeTransferShort") : formatMoney(listing.priceMinor, listing.currency, locale, { trimZeroCents: true });
  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-xl gap-6 px-5 pt-4 pb-16 sm:px-8">
        <p className="font-label text-sm font-bold text-ink-muted">{t("pageTitle")}</p>
        <section className="grid gap-1 rounded-lg bg-surface-sunken p-5">
          <h1 className="font-display text-[clamp(1.8rem,5vw,2.6rem)] leading-[0.95] tracking-[-0.05em]">{e.title}</h1>
          <p>
            {formatDate(e.startsAt, e.timezone, locale)} · {formatTime(e.startsAt, e.timezone, locale)}
          </p>
          {e.locationName || e.city ? <p className="text-ink-muted">{[e.locationName, e.city].filter(Boolean).join(", ")}</p> : null}
        </section>
        <section className="grid gap-4 rounded-[var(--r-panel)] bg-surface-raised p-5 shadow-md ring-1 ring-line">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold">{listing.ticket.ticketType.name}</p>
            <p className="font-display text-2xl tabular-nums">{price}</p>
          </div>
          <p className="text-sm text-ink-muted">{t("pageExplain")}</p>
          {available ? (
            <ResaleBuy
              linkCode={listing.linkCode}
              label={t("buy", { price })}
              organizationName={org.brand?.displayName ?? org.name}
              requirePhone={e.requireBuyerPhone}
              publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
            />
          ) : (
            <p className="rounded-md bg-surface-sunken px-4 py-3 text-sm">{t(listing.status === "RESERVED" ? "unavailable_RESERVED" : "unavailable_GONE")}</p>
          )}
        </section>
        <Link href={`/${e.slug}`} className={buttonClass("secondary", "lg", "justify-self-start")}>
          {t("backToEvent")}
        </Link>
      </div>
    </PublicShell>
  );
}
