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
}: {
  items: { href: string; label: string; count?: number }[];
  label: string;
}) {
  const pathname = usePathname().replace(/\/$/, "");
  const active =
    items.find((i) => i.href === pathname)?.href ??
    items
      .filter((i) => pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul
        role="list"
        className="inline-flex gap-1 rounded-full bg-surface-sunken p-1"
      >
        {items.map((i) => {
          const on = i.href === active;
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                  on
                    ? "bg-surface-raised text-ink shadow-[var(--elev-sm)]"
                    : "text-ink-muted hover:text-ink",
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
