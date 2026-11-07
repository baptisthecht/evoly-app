import type { Metadata } from "next";
import { BarActions } from "@/components/shell/EventTabs";
import { buttonClass } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Controls";
import { DownloadIcon } from "@/components/ui/icons";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { EmptyState } from "@/components/ui/Card";
import { waitlistCounts } from "@/server/waitlist";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("waitlist") };
}

/** Vente, liste d'attente (section 9.30) : qui attend une place, par tarif, et l'export. */
export default async function WaitlistPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("tickets");
  const waitlist = await waitlistCounts(eventId);
  if (!waitlist.length)
    return (
      <EmptyState title={t("waitlistEmptyTitle")}>
        {t("waitlistEmptyBody")}
      </EmptyState>
    );
  // refonte A3 : l'export à droite des onglets en boutons (BarActions), une ligne par tarif entre des filets
  return (
    <>
      <BarActions>
        <a
          href={`/o/${orgSlug}/events/${eventId}/waitlist.csv`}
          className={buttonClass("secondary")}
        >
          <DownloadIcon />
          {t("waitlistExport")}
        </a>
      </BarActions>
      <section aria-labelledby="waitlist-title">
        <SectionTitle id="waitlist-title" title={t("waitlistTitle")} />
        <ul role="list">
          {waitlist.map((w) => (
            <li key={w.ticketTypeId} className="border-b border-line py-[9px]">
              {t("waitlistLine", {
                name:
                  event.ticketTypes.find((tt) => tt.id === w.ticketTypeId)
                    ?.name ?? "",
                people: w._count._all,
                places: w._sum.quantity ?? 0,
              })}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
