import { hasFeature } from "@evoly/core";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProductStatusBadge } from "@/app/o/[orgSlug]/shop/ProductsTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireOrgContext } from "@/server/context";
import { getProductForEdit } from "@/server/shop";

/** Un produit de la boutique : sa bande d'en-tête (fil « Boutique / Produits », nom, statut). */
export default async function Header({
  params,
}: {
  params: Promise<{ orgSlug: string; productId: string }>;
}) {
  const { orgSlug, productId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!hasFeature(ctx.features, "SHOP")) return null;
  const product = await getProductForEdit(ctx, productId).catch(() => null);
  if (!product) return null;
  const nav = await getTranslations("nav");
  const s = await getTranslations("sections");
  const base = `/o/${ctx.organization.slug}/shop`;
  return (
    <PageHeader
      eyebrow={
        <p className="text-[12.5px] text-ink-muted">
          <Link href={base} className="hover:text-ink">
            {nav("shop")}
          </Link>{" "}
          /{" "}
          <Link href={base} className="hover:text-ink">
            {s("tab_products")}
          </Link>
        </p>
      }
      title={product.name}
      badge={<ProductStatusBadge status={product.status} />}
    />
  );
}
