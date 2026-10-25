import { OrgTabBar } from "@/components/shell/OrgTabBar";

/** Barre d’onglets du téléphone : navigation de l’organisation. */
export default async function OrgTabs({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <OrgTabBar orgSlug={orgSlug} />;
}
