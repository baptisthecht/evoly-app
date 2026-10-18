import { EventNav } from "@/components/shell/EventNav";
import { OrgNav } from "@/components/shell/OrgNav";

/** Dans un événement, la barre de l'organisation laisse la place à celle de l'événement. */
export default async function EventSidebar({ params }: { params: Promise<{ orgSlug: string; eventId: string; rest: string[] }> }) {
  const { orgSlug, eventId, rest } = await params;
  return eventId === "new" ? <OrgNav orgSlug={orgSlug} /> : <EventNav orgSlug={orgSlug} eventId={eventId} current={rest[0]} />;
}
