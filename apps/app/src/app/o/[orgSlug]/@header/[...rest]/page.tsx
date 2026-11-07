import { SectionHeader } from "@/components/shell/SectionHeader";

/** Chaque section de l'organisation : sa bande d'en-tête (titre, onglets, boutons). */
export default async function Header({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug, rest } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  return (
    <SectionHeader
      orgSlug={orgSlug}
      section={rest[0] ?? ""}
      query={{ period: one(sp.period), event: one(sp.event), tab: one(sp.tab) }}
    />
  );
}
