"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export interface SectionTab {
  label: string;
  href: string;
  /** Pages rattachées à l'onglet (préfixe d'adresse), par exemple une campagne pour « Campagnes ». */
  match?: string;
}

/** Onglets d'une section dans la bande d'en-tête : même dessin que ceux d'un événement. */
export function SectionTabs({
  tabs,
  label,
}: {
  tabs: SectionTab[];
  label: string;
}) {
  const path = (usePathname() ?? "").replace(/\/$/, "");
  const sp = useSearchParams();
  const score = (tab: SectionTab) => {
    if (tab.match && (path === tab.match || path.startsWith(`${tab.match}/`)))
      return 5000;
    const u = new URL(tab.href, "https://evoly.me");
    const p = u.pathname.replace(/\/$/, "");
    if (path !== p && !path.startsWith(`${p}/`)) return -1;
    for (const [k, v] of u.searchParams) if (sp?.get(k) !== v) return -1;
    return p.length + 1000 * [...u.searchParams].length;
  };
  const scores = tabs.map(score);
  const best = Math.max(...scores);
  return (
    <UnderlineTabs label={label}>
      {tabs.map((x, i) => {
        const on = best >= 0 && scores[i] === best;
        return (
          <Link
            key={x.href}
            href={x.href}
            aria-current={on ? "page" : undefined}
            className={underlineTab(on)}
          >
            {x.label}
          </Link>
        );
      })}
    </UnderlineTabs>
  );
}

/**
 * Onglets soulignés (refonte A3, maquettes UIUX/) : 13,5 px, 24 px entre eux ; l'onglet actif en demi-gras, souligné d'un
 * trait charbon de 2 px posé sur le filet de la bande. Le trait dépasse d'un pixel sous la rangée : la marge négative le
 * pose sur le filet sans qu'il soit coupé par le défilement (téléphone).
 */
export function UnderlineTabs({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      // sur téléphone (maquette « Sur téléphone », « .ptabs ») : 14 px, 18 px entre les onglets, coupés au bord de l'écran
      className="mt-2.5 -mb-px flex gap-[18px] overflow-x-auto pb-px [scrollbar-width:none] lg:mt-3 lg:gap-6 [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </nav>
  );
}

export const underlineTab = (on: boolean) =>
  on
    ? "relative shrink-0 py-2.5 text-[14px] font-semibold whitespace-nowrap text-ink-strong after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink-strong lg:pt-[9px] lg:pb-[11px] lg:text-[13.5px] lg:after:rounded-t-[2px]"
    : "relative shrink-0 py-2.5 text-[14px] whitespace-nowrap text-ink-muted hover:text-ink lg:pt-[9px] lg:pb-[11px] lg:text-[13.5px]";
