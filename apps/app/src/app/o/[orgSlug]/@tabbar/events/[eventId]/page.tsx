import { EventTabBar } from "@/components/shell/EventTabBar";

/** Barre d’onglets du téléphone : navigation de l’événement. */
export default async function EventTabs({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  return <EventTabBar orgSlug={orgSlug} eventId={eventId} />;
}
