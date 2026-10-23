import { SectionHeader } from "@/components/shell/SectionHeader";

/** Accueil : bande d'en-tête de la section. */
export default async function Header({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <SectionHeader orgSlug={orgSlug} section="" />;
}
