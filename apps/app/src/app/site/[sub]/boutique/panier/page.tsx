import type { Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicShell } from "@/components/public/PublicShell";
import { CartView } from "@/components/public/shop/CartView";
import { shopOpenFor } from "@/server/shopCheckout";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslations("shopPublic"))("cartTitle"),
    robots: { index: false, follow: false },
  };
}

/** Panier de la boutique (US-SHOP-04) : relu par le serveur, puis « Commander ». */
export default async function CartPage({
  params,
}: {
  params: Promise<{ sub: string }>;
}) {
  const { sub } = await params;
  const site = await siteGate(sub, "/boutique/panier");
  if (site.kind === "DISABLED")
    return <DisabledSite fallback={site.fallback} />;
  const org = site.org;
  if (!(await shopOpenFor(org.id))) notFound();
  const t = await getTranslations("shopPublic");
  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-2xl gap-6 px-5 pb-16 sm:px-8">
        <Link href="/boutique" className="text-sm underline underline-offset-4">
          {t("backToShop")}
        </Link>
        <h1 className="font-display text-[clamp(1.8rem,5vw,2.6rem)] leading-[1] tracking-[-0.03em]">
          {t("cartTitle")}
        </h1>
        <CartView
          sub={sub}
          organizationId={org.id}
          locale={(await getLocale()) as Locale}
          currency={org.currency}
        />
      </div>
    </PublicShell>
  );
}
