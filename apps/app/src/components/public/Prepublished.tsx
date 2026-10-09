import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hasFeature, salesOpeningAt } from "@evoly/core";
import { formatDateTime, toLocale } from "@evoly/i18n";
import { env } from "@/lib/env";
import { calendarTitle, googleCalendarUrl } from "@/server/calendar";
import type { PublicEventData, PublicOrganization } from "@/server/publicEvents";
import { previewAllowed } from "@/server/publication";
import { eventPublicUrl } from "@/server/urls";
import { AlertForm } from "./AlertForm";
import { PresaleAutoUnlock } from "./PresaleAutoUnlock";
import { PresaleForm } from "./PresaleForm";
import { loadPublicEvent } from "@/server/publicEvents";
import { presaleCookie } from "@/server/presale";
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
        <OpeningExtras
          eventId={e.id}
          calendar={{
            title: calendarTitle({ locale, prepublished: true, teaserText: e.teaserText, eventTitle: e.title, organizationName: name }),
            start: salesOpeningAt(e) ?? e.publishAt!,
            url: eventPublicUrl(org, e),
          }}
        />
        <a href={homeHref} className="text-sm underline underline-offset-4">
          {t("teaserSeeOrg", { org: name })}
        </a>
      </section>
    </div>
  );
}

/** « Prévenez-moi » et ajout à l'agenda (RG-PRG-04, RG-PRG-05), sous chaque décompte. */
async function OpeningExtras({ eventId, calendar }: { eventId: string; calendar: { title: string; start: Date; url: string } }) {
  const t = await getTranslations("public");
  const locale = toLocale(await getLocale());
  const ics = `${env().NEXT_PUBLIC_APP_URL}/api/events/${eventId}/opening.ics?lang=${locale}`;
  return (
    <div className="grid w-full justify-items-center gap-3">
      <AlertForm
        eventId={eventId}
        labels={{
          title: t("alertTitle"),
          intro: t("alertIntro"),
          email: t("alertEmail"),
          submit: t("alertSubmit"),
          consent: t("alertConsent"),
          done: t("alertDone"),
          error: t("alertError"),
          invalid: t("alertInvalid"),
          limited: t("alertLimited"),
        }}
      />
      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
        <a href={ics} rel="nofollow" className="underline underline-offset-4">
          {t("calAdd")}
        </a>
        <a href={googleCalendarUrl(calendar)} target="_blank" rel="noopener nofollow" className="underline underline-offset-4">
          {t("calGoogle")}
        </a>
      </p>
      <PresaleForm
        eventId={eventId}
        labels={{ ask: t("presaleAsk"), code: t("presaleCode"), submit: t("presaleSubmit"), invalid: t("presaleInvalid"), limited: t("alertLimited") }}
      />
    </div>
  );
}

/** Décompte jusqu'à l'ouverture des ventes, dans le bloc des billets, avec « Prévenez-moi » et l'ajout à l'agenda. */
export async function SalesCountdown({
  opensAt,
  timeZone,
  now,
  eventId,
  eventTitle,
  url,
}: {
  opensAt: Date;
  timeZone: string;
  now: Date;
  eventId: string;
  eventTitle: string;
  url: string;
}) {
  const t = await getTranslations("public");
  const locale = toLocale(await getLocale());
  return (
    <div className="grid gap-3 rounded-xl bg-surface p-4 ring-1 ring-line">
      <p className="text-center text-sm font-medium">{t("salesOpenOn", { date: formatDateTime(opensAt, timeZone, locale) })}</p>
      <Countdown target={opensAt.toISOString()} serverNow={now.toISOString()} labels={await countdownLabels()} />
      <OpeningExtras
        eventId={eventId}
        calendar={{ title: calendarTitle({ locale, prepublished: false, teaserText: null, eventTitle, organizationName: "" }), start: opensAt, url }}
      />
    </div>
  );
}

type Query = { apercu?: string; prevente?: string };

/** Chargement pour un visiteur : avec un code de prévente mémorisé et valable, la vente lui est ouverte (RG-PRV-02). */
export async function loadEventForVisitor(org: PublicOrganization, where: { organizationId: string; slug: string } | { id: string }) {
  const data = await loadPublicEvent(where);
  if (!data || (!data.prepublished && data.salesOpen) || !hasFeature(org.features, "PRESALE_CODES")) return data;
  const code = await presaleCookie(data.event.id);
  if (!code) return data;
  const unlocked = await loadPublicEvent(where, { presaleCode: code });
  return unlocked?.presale ? unlocked : data;
}

/** Métadonnées : jamais indexé en prévente ni avant la publication. */
export async function eventRouteMetadata(org: PublicOrganization, data: PublicEventData, query: Query): Promise<Metadata> {
  if (data.presale) return { ...(await eventMetadata(org, data)), robots: { index: false, follow: false } };
  if (data.prepublished) return prepublishedMetadata(org, data, query.apercu);
  return eventMetadata(org, data);
}

/** Aiguillage d'une page d'événement : prévente, lien de prévente, pas encore publié, ou page normale. */
export async function EventRouteView({ org, data, homeHref, query }: { org: PublicOrganization; data: PublicEventData; homeHref: string; query: Query }) {
  const t = await getTranslations("public");
  if (data.presale)
    return (
      <>
        <p role="status" className="bg-info-soft px-4 py-3 text-center text-sm">
          {t("presaleBanner")}
        </p>
        <PublicEventPage org={org} data={data} homeHref={homeHref} />
      </>
    );
  if (query.prevente)
    return (
      <PresaleAutoUnlock
        eventId={data.event.id}
        code={query.prevente.slice(0, 60)}
        labels={{ working: t("presaleUnlocking"), invalid: t("presaleInvalid"), back: t("presaleBack") }}
      />
    );
  if (data.prepublished) return <PrepublishedEvent org={org} data={data} homeHref={homeHref} token={query.apercu} />;
  return <PublicEventPage org={org} data={data} homeHref={homeHref} />;
}
