import { OrgNav } from "@/components/shell/OrgNav";

export default async function OrgSidebar({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <OrgNav orgSlug={orgSlug} />;
}
