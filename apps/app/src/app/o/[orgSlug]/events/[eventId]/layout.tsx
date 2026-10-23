import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { eventHeaderData } from "@/components/shell/eventData";
import { EventSubTabs } from "@/components/shell/EventTabs";

/** Événement : la bande d'en-tête vient de l'emplacement @header ; ici, les pages de la partie ouverte, puis la page. */
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
    <div className="grid gap-5">
      <EventSubTabs tabs={data.tabs} hidden={data.hidden} />
      {children}
    </div>
  );
}
