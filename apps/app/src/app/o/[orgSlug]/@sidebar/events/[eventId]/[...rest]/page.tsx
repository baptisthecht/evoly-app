import { OrgNav } from "@/components/shell/OrgNav";

/** Dans un événement, la barre de l'organisation reste affichée : les parties de l'événement sont en onglets, en haut. */
export default async function EventSidebar({ params }: { params: Promise<{ orgSlug: string; eventId: string; rest: string[] }> }) {
  const { orgSlug } = await params;
  return <OrgNav orgSlug={orgSlug} />;
}
