import Link from "next/link";

export interface ProductGridItem {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  imageAlt: string | null;
  /** « 25 € », « à partir de 25 € » */
  price: string;
  soldOut: boolean;
}

/** Produits de la boutique en cartes (photo, nom, prix, épuisé), pour la boutique et la page de l'organisation. */
export function ProductGrid({
  products,
  soldOutLabel,
}: {
  products: ProductGridItem[];
  soldOutLabel: string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/boutique/${p.slug}`} className="grid gap-2.5">
            <span className="relative block aspect-square overflow-hidden rounded-[1.4rem] bg-surface-sunken">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.imageAlt || ""}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : null}
              {p.soldOut ? (
                <span className="absolute top-3 right-3 rounded-xl bg-surface-inverse px-2.5 py-1.5 text-xs font-semibold text-ink-inverse">
                  {soldOutLabel}
                </span>
              ) : null}
            </span>
            <span className="grid gap-0.5">
              <span className="font-label font-bold">{p.name}</span>
              <span className="text-sm text-ink-muted">{p.price}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
