import { EventHeader } from "@/components/shell/EventHeader";

/** Bande d'en-tête de l'événement (maquette validée) : titre, statut, date, lieu, boutons, onglets. */
export default async function Header({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  return eventId === "new" ? null : <EventHeader orgSlug={orgSlug} eventId={eventId} />;
}
