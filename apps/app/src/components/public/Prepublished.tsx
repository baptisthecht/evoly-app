import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime, toLocale } from "@evoly/i18n";
import type { PublicEventData, PublicOrganization } from "@/server/publicEvents";
import { previewAllowed } from "@/server/publication";
import { Countdown } from "./Countdown";
import { PublicEventPage, eventMetadata } from "./EventPage";

async function countdownLabels() {
  const t = await getTranslations("public");
  return { days: t("cdDays"), hours: t("cdHours"), minutes: t("cdMinutes"), seconds: t("cdSeconds") };
}

/** Avant la publication programmée (RG-PRG-01) : jamais indexé ; l'annonce ne révèle ni titre, ni description, ni affiche. */
export async function prepublishedMetadata(org: PublicOrganization, data: PublicEventData, token: string | undefined): Promise<Metadata> {
  if (previewAllowed(data.event, token)) return { ...(await eventMetadata(org, data)), robots: { index: false, follow: false } };
  const t = await getTranslations("public");
  const name = org.brand?.displayName ?? org.name;
  return { title: { absolute: `${data.event.teaserText ?? t("teaserDefault")} · ${name}` }, robots: { index: false, follow: false } };
}

/** Aperçu par lien secret (page complète, sans achat), redirection si l'événement est invisible, sinon l'annonce floutée. */
export async function PrepublishedEvent({
  org,
  data,
  homeHref,
  token,
}: {
  org: PublicOrganization;
  data: PublicEventData;
  homeHref: string;
  token: string | undefined;
}) {
  const e = data.event;
  const t = await getTranslations("public");
  const locale = toLocale(await getLocale());
  const when = formatDateTime(e.publishAt!, e.timezone, locale);
  if (previewAllowed(e, token))
    return (
      <>
        <p role="status" className="bg-info-soft px-4 py-3 text-center text-sm">
          {t("previewLinkBanner", { date: when })}
        </p>
        <PublicEventPage org={org} data={data} homeHref={homeHref} preview />
      </>
    );
  if (e.prePublishMode === "HIDDEN") redirect(homeHref);
  const name = org.brand?.displayName ?? org.name;
  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-surface px-6 py-20 text-ink">
      <div
        aria-hidden="true"
        className="absolute -inset-16 -z-10 opacity-80 blur-3xl"
        style={{
          background:
            "radial-gradient(36% 44% at 28% 32%, #ffb8e8 0%, transparent 72%), radial-gradient(38% 46% at 72% 66%, #c9b6ff 0%, transparent 72%), radial-gradient(28% 36% at 62% 18%, #fff6f0 0%, transparent 72%)",
        }}
      />
      <section className="grid max-w-2xl justify-items-center gap-6 text-center" aria-labelledby="teaser-title">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">{name}</p>
        <h1 id="teaser-title" className="font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          {e.teaserText ?? t("teaserDefault")}
        </h1>
        <p className="text-ink-muted">{t("teaserOpens", { date: when })}</p>
        <Countdown target={e.publishAt!.toISOString()} serverNow={new Date().toISOString()} labels={await countdownLabels()} />
        <a href={homeHref} className="text-sm underline underline-offset-4">
          {t("teaserSeeOrg", { org: name })}
        </a>
      </section>
    </div>
  );
}

/** Décompte jusqu'à l'ouverture des ventes, dans le bloc des billets. */
export async function SalesCountdown({ opensAt, timeZone, now }: { opensAt: Date; timeZone: string; now: Date }) {
  const t = await getTranslations("public");
  const locale = toLocale(await getLocale());
  return (
    <div className="grid gap-3 rounded-xl bg-surface p-4 ring-1 ring-line">
      <p className="text-center text-sm font-medium">{t("salesOpenOn", { date: formatDateTime(opensAt, timeZone, locale) })}</p>
      <Countdown target={opensAt.toISOString()} serverNow={now.toISOString()} labels={await countdownLabels()} />
    </div>
  );
}
