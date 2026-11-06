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
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul
        role="list"
        className="inline-flex gap-0.5 rounded-[9px] bg-surface-sunken p-[3px]" // refonte A3 : la forme des maquettes
      >
        {items.map((i) => {
          const on = i.href === active;
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[0.8125rem] whitespace-nowrap transition-colors",
                  on
                    ? "bg-surface-raised font-semibold text-ink shadow-[0_1px_2px_rgba(34,34,34,0.08)]"
                    : "font-medium text-ink-muted hover:text-ink",
                )}
              >
                {i.label}
                {i.count != null ? (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      on ? "text-ink-muted" : "text-ink-subtle",
                    )}
                  >
                    {i.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
