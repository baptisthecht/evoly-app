import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireOrgContext } from "@/server/context";

/** Retrait des commandes de la boutique : fil « Boutique / Commandes » et titre. */
export default async function Header({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const nav = await getTranslations("nav");
  const s = await getTranslations("sections");
  const t = await getTranslations("shopOrders");
  const base = `/o/${ctx.organization.slug}/shop`;
  return (
    <PageHeader
      eyebrow={
        <p className="text-[12.5px] text-ink-muted">
          <Link href={base} className="hover:text-ink">
            {nav("shop")}
          </Link>{" "}
          /{" "}
          <Link href={`${base}?tab=orders`} className="hover:text-ink">
            {s("tab_shopOrders")}
          </Link>
        </p>
      }
      title={t("scanPickup")}
    />
  );
}
