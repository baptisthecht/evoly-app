import { OrgTabBar } from "./OrgTabBar";

/**
 * Barre du téléphone dans un événement (refonte A3, maquette « Sur téléphone ») : la barre de l'organisation,
 * « Événements » actif ; les parties de l'événement sont dans ses onglets, sous son titre.
 */
export async function EventTabBar({
  orgSlug,
}: {
  orgSlug: string;
  eventId?: string;
}) {
  return <OrgTabBar orgSlug={orgSlug} />;
}
