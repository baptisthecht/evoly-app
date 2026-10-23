import { SectionHeader } from "@/components/shell/SectionHeader";

/** Liste des événements : bande d'en-tête avec « Créer un événement ». */
export default async function Header({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <SectionHeader orgSlug={orgSlug} section="events" />;
}
