import type { Metadata } from "next";
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
  return (
    <section
      className="grid gap-1 rounded-lg bg-surface-sunken p-4 text-sm"
      aria-label={t("waitlistTitle")}
    >
      <h2 className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
        {t("waitlistTitle")}
        <a
          href={`/o/${orgSlug}/events/${eventId}/waitlist.csv`}
          className="text-sm font-normal underline underline-offset-4"
        >
          {t("waitlistExport")}
        </a>
      </h2>
      {waitlist.map((w) => (
        <p key={w.ticketTypeId}>
          {t("waitlistLine", {
            name:
              event.ticketTypes.find((tt) => tt.id === w.ticketTypeId)?.name ??
              "",
            people: w._count._all,
            places: w._sum.quantity ?? 0,
          })}
        </p>
      ))}
    </section>
  );
}
