import type { Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicShell } from "@/components/public/PublicShell";
import { CartLink } from "@/components/public/shop/ProductBuy";
import { ProductGrid } from "@/components/public/shop/ProductGrid";
import { getPublicOrganization } from "@/server/publicEvents";
import { productGridItems, publicShopProducts } from "@/server/shopPublic";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sub: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const org = await getPublicOrganization((await params).sub);
  if (!org) return {};
  const t = await getTranslations("shopPublic");
  return { title: `${t("title")} · ${org.brand?.displayName ?? org.name}` };
}

/** Boutique de l'organisation (US-SHOP-04) : ses produits en vente, mis en avant d'abord ; le panier. */
export default async function ShopPage({ params }: Props) {
  const { sub } = await params;
  const site = await siteGate(sub, "/boutique");
  if (site.kind === "DISABLED")
    return <DisabledSite fallback={site.fallback} />;
  const org = site.org;
  const products = await publicShopProducts(org.id);
  if (!products) notFound();
  const t = await getTranslations("shopPublic");
  const locale = (await getLocale()) as Locale;
  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 pb-16 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[clamp(1.9rem,6vw,3rem)] leading-[1] tracking-[-0.04em]">
            {t("title")}
          </h1>
          <CartLink organizationId={org.id} />
        </div>
        {products.length ? (
          <ProductGrid
            products={productGridItems(products, locale, (price) =>
              t("from", { price }),
            )}
            soldOutLabel={t("soldOut")}
          />
        ) : (
          <p className="text-ink-muted">{t("empty")}</p>
        )}
      </div>
    </PublicShell>
  );
}
