import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { eventHeaderData } from "@/components/shell/eventData";
import { EventSubTabs } from "@/components/shell/EventTabs";

/**
 * Événement : la bande d'en-tête vient de l'emplacement @header ; ici, la rangée des pages de la partie ouverte (onglets en
 * boutons à gauche, bouton de la page à droite, BarActions), puis la page sur toute la largeur, 24 px plus bas.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const data = await eventHeaderData(orgSlug, eventId);
  if (!data) notFound();
  return (
    // sur téléphone, 14 px sous les onglets (maquette « Sur téléphone ») ; 12 px ailleurs
    <div className="grid gap-x-3 gap-y-6 max-lg:pt-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:[&>:not([data-bar]):not([data-subtabs])]:col-span-2">
      <EventSubTabs tabs={data.tabs} hidden={data.hidden} />
      {children}
    </div>
  );
}
