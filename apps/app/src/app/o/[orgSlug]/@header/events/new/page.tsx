import { SectionHeader } from "@/components/shell/SectionHeader";

/**
 * Création d'un événement : la bande d'en-tête « Nouvel événement », sans le bouton « Créer un événement » (les
 * emplacements parallèles suivent le chemin exact : sans ce fichier, l'en-tête de la liste des événements s'affichait).
 */
export default async function Header({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <SectionHeader orgSlug={orgSlug} section="events-new" />;
}
