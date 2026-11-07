import { formatEventWhen, shortEventWhen, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { buttonClass } from "@/components/ui/Button";
import { eventPublicUrl } from "@/server/urls";
import { CopyLinkButton } from "./CopyLinkButton";
import { eventHeaderData } from "./eventData";
import { EventTabs } from "./EventTabs";

/**
 * En-tête d'un événement (refonte A3, maquettes UIUX/) : « Événements » au-dessus, le titre en 21 px avec son statut, la
 * date longue et le lieu, « Prévisualiser » et « Copier le lien » à droite, puis les sept onglets soulignés.
 */
export async function EventHeader({
  orgSlug,
  eventId,
}: {
  orgSlug: string;
  eventId: string;
}) {
  const data = await eventHeaderData(orgSlug, eventId);
  if (!data) return null;
  const { ctx, event, base, tabs, hidden } = data;
  const t = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const where = [event.locationName, event.city].filter(Boolean).join(", ");
  // sur téléphone (maquette « Sur téléphone ») : « Sam. 21 nov., 20:00, Wépion », la ville seule
  const phoneWhen = [
    shortEventWhen(event.startsAt, event.timezone, locale),
    event.city ?? event.locationName,
  ]
    .filter(Boolean)
    .join(", ");
  const onSale =
    event.status === "PUBLISHED" &&
    !(event.salesStartAt && event.salesStartAt.getTime() > Date.now());
  return (
    <div className="border-b border-line bg-surface-raised px-[18px] sm:px-8 lg:px-7">
      <div className="mx-auto max-w-[var(--content-max)] pt-1 lg:pt-3.5">
        {/* le fil : « Événements » en 12,5 px gris ; sur téléphone, un retour « ‹ Événements » en 15 px */}
        <div className="text-[15px] lg:text-[12.5px]">
          <Link
            href={`/o/${ctx.organization.slug}/events`}
            className="inline-flex items-center gap-1 text-ink-body hover:text-ink lg:text-ink-muted"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-[18px] lg:hidden"
            >
              <path d="m15 6-6 6 6 6" />
            </svg>
            {t("events")}
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
          <div className="min-w-0">
            {/* sur téléphone : le titre en 22 px, sans les boutons (maquette « Sur téléphone ») ; le statut seulement s'il
                n'est pas « En vente » (la maquette montre un événement en vente, sans pastille) : un brouillon, un
                événement programmé, annulé ou terminé le dit */}
            <h1 className="mt-2 mb-0.5 flex flex-wrap items-center gap-2.5 text-[22px] leading-[1.2] font-semibold break-words lg:mt-0.5 lg:mb-[3px] lg:text-[21px] lg:leading-[1.25] lg:tracking-[-0.01em]">
              {event.title}
              {/* « contents » : sur ordinateur, la pastille reste un élément de la rangée, centrée sur le titre */}
              <span className={onSale ? "contents max-lg:hidden" : "contents"}>
                <EventStatusBadge
                  status={event.status}
                  salesStartAt={event.salesStartAt}
                />
              </span>
            </h1>
            <p className="text-[13px] text-ink-muted max-lg:hidden">
              {formatEventWhen(event.startsAt, event.timezone, locale)}
              {where ? `, ${where}` : ""}
            </p>
            <p className="text-[13px] text-ink-muted lg:hidden">{phoneWhen}</p>
          </div>
          <div className="flex flex-wrap gap-2 max-lg:hidden">
            <Link href={`${base}/preview`} className={buttonClass("secondary")}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {t("previewPage")}
            </Link>
            <CopyLinkButton url={eventPublicUrl(ctx.organization, event)} />
          </div>
        </div>
        <EventTabs tabs={tabs} hidden={hidden} />
      </div>
    </div>
  );
}
