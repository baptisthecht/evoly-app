import { SectionHeader } from "@/components/shell/SectionHeader";

/** Chaque section de l'organisation : sa bande d'en-tête (titre, onglets, boutons). */
export default async function Header({ params }: { params: Promise<{ orgSlug: string; rest: string[] }> }) {
  const { orgSlug, rest } = await params;
  return <SectionHeader orgSlug={orgSlug} section={rest[0] ?? ""} />;
}
