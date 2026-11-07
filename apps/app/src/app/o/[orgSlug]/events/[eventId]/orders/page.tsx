import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarActions } from "@/components/shell/EventTabs";
import { buttonClass } from "@/components/ui/Button";
import { DownloadIcon } from "@/components/ui/icons";
import { OrdersView, type OrdersSearch } from "../../../orders/OrdersView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

/**
 * Participants › Commandes : les commandes de l'événement, sans quitter l'événement (ni filtre ni colonne « Événement »),
 * et l'export des participants à droite des onglets en boutons.
 */
export default async function EventOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<OrdersSearch>;
}) {
  const { orgSlug, eventId } = await params;
  const t = await getTranslations("events");
  return (
    <>
      <BarActions>
        {/* un fichier CSV : un lien ordinaire, sans préchargement */}
        <a
          href={`/o/${orgSlug}/events/${eventId}/participants`}
          className={buttonClass("secondary")}
        >
          <DownloadIcon />
          {t("exportParticipantsShort")}
        </a>
      </BarActions>
      <OrdersView orgSlug={orgSlug} sp={await searchParams} eventId={eventId} />
    </>
  );
}
