"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export interface SectionTab {
  label: string;
  href: string;
  /** Pages rattachées à l'onglet (préfixe d'adresse), par exemple une campagne pour « Campagnes ». */
  match?: string;
}

/** Onglets d'une section dans la bande d'en-tête : même dessin que ceux d'un événement. */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const path = (usePathname() ?? "").replace(/\/$/, "");
  const sp = useSearchParams();
  const score = (tab: SectionTab) => {
    if (tab.match && (path === tab.match || path.startsWith(`${tab.match}/`))) return 5000;
    const u = new URL(tab.href, "https://evoly.me");
    const p = u.pathname.replace(/\/$/, "");
    if (path !== p && !path.startsWith(`${p}/`)) return -1;
    for (const [k, v] of u.searchParams) if (sp?.get(k) !== v) return -1;
    return p.length + 1000 * [...u.searchParams].length;
  };
  const scores = tabs.map(score);
  const best = Math.max(...scores);
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,#000_82%,transparent)] sm:[mask-image:none]">
      {tabs.map((x, i) => {
        const on = best >= 0 && scores[i] === best;
        return (
          <Link
            key={x.href}
            href={x.href}
            aria-current={on ? "page" : undefined}
            className={
              on
                ? "shrink-0 border-b-2 border-ink px-3 py-2.5 text-sm font-medium whitespace-nowrap text-ink"
                : "shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-ink-muted hover:text-ink"
            }
          >
            {x.label}
          </Link>
        );
      })}
    </nav>
  );
}
