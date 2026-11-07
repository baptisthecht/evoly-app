"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

/**
 * Onglets en boutons, troisième niveau de la navigation (sous les onglets de l'en-tête) :
 * une rangée de pastilles, l'onglet actif en relief, un compteur facultatif ; défile sur téléphone.
 * Actif : l'adresse exacte, sinon le plus long préfixe.
 */
export function ButtonTabs({
  items,
  label,
  current,
}: {
  items: { href: string; label: string; count?: number }[];
  label: string;
  /** Onglet actif imposé (onglets portés par un paramètre de l'adresse, que le chemin ne distingue pas). */
  current?: string;
}) {
  const pathname = usePathname().replace(/\/$/, "");
  const active =
    current ??
    items.find((i) => i.href === pathname)?.href ??
    items
      .filter((i) => pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  // refonte A3 (maquettes UIUX/, « .seg ») : fond gris, arrondi 9 px, 3 px de marge ; onglets de 13 px (5 px sur 12 px),
  // l'actif sur blanc en demi-gras avec une ombre fine ; le compteur en gris, après une espace
  return (
    <nav aria-label={label} className="-mx-1 max-w-full overflow-x-auto px-1">
      <ul
        role="list"
        className="inline-flex gap-0.5 rounded-[9px] bg-surface-sunken p-[3px]"
      >
        {items.map((i) => {
          const on = i.href === active;
          return (
            <li key={i.href} className="flex">
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "rounded-[7px] px-3 py-[5px] text-[13px] whitespace-nowrap",
                  on
                    ? "bg-surface-raised font-semibold text-ink-strong shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-ink-soft hover:text-ink",
                )}
              >
                {i.label}
                {i.count != null ? (
                  <>
                    {" "}
                    <span className="text-ink-muted tabular-nums">
                      {i.count}
                    </span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
