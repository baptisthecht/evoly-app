import type { Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicShell } from "@/components/public/PublicShell";
import {
  CartLink,
  ProductBuy,
  ProductGallery,
} from "@/components/public/shop/ProductBuy";
import { getPublicOrganization } from "@/server/publicEvents";
import { publicShopProduct } from "@/server/shopPublic";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sub: string; productSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sub, productSlug } = await params;
  const org = await getPublicOrganization(sub);
  const product = org ? await publicShopProduct(org.id, productSlug) : null;
  if (!org || !product) return {};
  return {
    title: `${product.name} · ${org.brand?.displayName ?? org.name}`,
    description: product.description?.slice(0, 160) ?? undefined,
    openGraph: product.images[0]
      ? { images: [{ url: product.images[0].url }] }
      : undefined,
  };
}

/**
 * Page d'un produit (US-SHOP-04) : galerie, description, choix des options, prix de la variante, disponibilité,
 * ajout au panier ; modes de remise et droit de rétractation rappelés.
 */
export default async function ProductPage({ params }: Props) {
  const { sub, productSlug } = await params;
  const site = await siteGate(sub, `/boutique/${productSlug}`);
  if (site.kind === "DISABLED")
    return <DisabledSite fallback={site.fallback} />;
  const org = site.org;
  const product = await publicShopProduct(org.id, productSlug);
  if (!product) notFound();
  const t = await getTranslations("shopPublic");
  const locale = (await getLocale()) as Locale;
  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 pb-16 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/boutique"
            className="text-sm underline underline-offset-4"
          >
            {t("backToShop")}
          </Link>
          <CartLink organizationId={org.id} />
        </div>
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <ProductGallery name={product.name} images={product.images} />
          <div className="grid content-start gap-5">
            <h1 className="font-display text-[clamp(1.8rem,5vw,2.8rem)] leading-[1.02] tracking-[-0.03em]">
              {product.name}
            </h1>
            <ProductBuy
              organizationId={org.id}
              locale={locale}
              currency={product.currency}
              name={product.name}
              images={product.images}
              options={product.options}
              variants={product.variants}
            />
            {product.description ? (
              <p className="text-pretty whitespace-pre-line">
                {product.description}
              </p>
            ) : null}
            <div className="grid gap-1 border-t border-line pt-4 text-sm text-ink-muted">
              {product.pickupEnabled && product.pickupPoints.length ? (
                <p>
                  {t("pickupAt", { places: product.pickupPoints.join(", ") })}
                </p>
              ) : null}
              <p>{t("withdrawalShort")}</p>
            </div>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
