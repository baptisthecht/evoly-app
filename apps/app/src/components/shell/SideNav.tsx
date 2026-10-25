"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export type NavIcon =
  | "pilot"
  | "grow"
  | "org"
  | "grid"
  | "ticket"
  | "megaphone"
  | "scan"
  | "users"
  | "settings"
  | "back"
  | "plus"
  | "home"
  | "calendar"
  | "receipt"
  | "repeat"
  | "coins"
  | "send"
  | "palette"
  | "card"
  | "gear"
  | "more"
  | "door"
  | "close"
  | "tag"
  | "code"
  | "mail"
  | "rocket"
  | "chair"
  | "table"
  | "layers"
  | "share"
  | "printer"
  | "offline"
  | "star";
export interface NavItem {
  label: string;
  href: string;
  exact?: boolean;
  pro?: string;
  icon?: NavIcon;
}
export interface NavSection {
  label: string;
  icon: NavIcon;
  items: NavItem[];
}
export type NavSolo = NavItem & { icon: NavIcon };

// un seul jeu d'icônes, au trait fin, pour toute la navigation
const ICONS: Record<NavIcon, ReactNode> = {
  pilot: (
    <>
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19H2" />
    </>
  ),
  grow: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  org: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  ticket: (
    <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
  ),
  megaphone: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
    </>
  ),
  scan: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  back: <path d="M15 18l-6-6 6-6" />,
  home: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  coins: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9a2.8 2.8 0 0 0-2.8-1.5c-1.5 0-2.7.9-2.7 2.1 0 2.9 5.7 1.6 5.7 4.6 0 1.2-1.3 2.2-2.9 2.2a3 3 0 0 1-2.9-1.6M12 6v1.5M12 16.5V18" />
    </>
  ),
  send: <path d="M3 11l18-8-8 18-2-8-8-2z" />,
  palette: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  // barre d'onglets du téléphone : « Plus », Jour J (la porte, pas le scanner), quitter un événement
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />,
  door: (
    <>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18" />
      <path d="M14 12h.01" strokeWidth={3} />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  // pages de la feuille « Plus » (tuiles comme des applications)
  tag: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <path d="M7.5 7.5h.01" strokeWidth={3} />
    </>
  ),
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 15l-3-3c1.5-4.5 4.5-8 10-9-1 5.5-4.5 8.5-9 10z" />
      <path d="M9 12H5l2-4h4M12 15v4l4-2v-4M5.5 18.5C4 17 4 15 4 15s2 0 3.5 1.5" />
    </>
  ),
  chair: (
    <>
      <path d="M6 10V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" />
      <path d="M4 10h16v4H4zM6 14v6M18 14v6" />
    </>
  ),
  table: (
    <>
      <ellipse cx="12" cy="8" rx="9" ry="3" />
      <path d="M12 11v9M8 20h8" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V3h10v6M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  offline: (
    <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5a15 15 0 0 1 11.3 3.8M12 20h.01" />
  ),
  star: (
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />
  ),
};

export function NavGlyph({
  name,
  className,
}: {
  name: NavIcon;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      {ICONS[name]}
    </svg>
  );
}

const pathOf = (href: string) => href.split("?")[0]!;

// page active : texte en gras et son segment du trait en rose ; survol : texte en gras seulement (ni fond, ni arrondi)
// maquette validée : lien actif sur fond gris, icône de chaque page, aucun filet
const itemClass = (on: boolean) =>
  cn(
    "flex min-h-10 items-center gap-2.5 rounded-sm px-2.5 text-[0.875rem] transition-colors",
    on
      ? "bg-surface font-medium text-ink"
      : "text-ink-muted hover:bg-surface hover:text-ink",
  );
const soloClass = itemClass;

/** Barre latérale : une entrée seule en haut, des catégories (icône, puis pages décalées sous un filet), des entrées en bas. */
export function SideNav({
  label,
  before,
  top,
  sections,
  after,
  bottom = [],
}: {
  label: string;
  before?: ReactNode;
  top?: NavSolo;
  sections: NavSection[];
  after?: ReactNode;
  bottom?: NavSolo[];
}) {
  const pathname = usePathname();
  const active = (i: NavItem) => {
    const h = pathOf(i.href);
    return i.exact
      ? pathname === h
      : pathname === h || pathname.startsWith(`${h}/`);
  };
  const solo = (i: NavSolo) => (
    <Link
      key={i.href}
      href={i.href}
      aria-current={active(i) ? "page" : undefined}
      className={soloClass(active(i))}
    >
      <NavGlyph name={i.icon} />
      {i.label}
    </Link>
  );
  return (
    <nav aria-label={label} className="grid gap-0.5">
      {before}
      {top ? solo(top) : null}
      {sections.map((s, n) => {
        const open = s.items.some(active); // la catégorie de la page ouverte est active elle aussi
        return (
          <div
            key={s.label}
            className={cn("grid gap-0.5", n > 0 || top ? "mt-4" : "")}
          >
            <p
              className={cn(
                "px-2.5 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.05em] uppercase",
                open ? "text-ink" : "text-ink-muted",
              )}
            >
              {s.label}
            </p>
            <ul className="grid gap-0.5">
              {s.items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active(i) ? "page" : undefined}
                    className={itemClass(active(i))}
                  >
                    {i.icon ? <NavGlyph name={i.icon} /> : null}
                    <span className="truncate">{i.label}</span>
                    {i.pro ? (
                      <span className="ml-auto rounded-sm bg-surface-sunken px-1.5 py-px text-[0.625rem] font-semibold text-ink">
                        {i.pro}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {after}
      {bottom.length > 0 ? (
        <div className="mt-3 grid gap-0.5 border-t border-line pt-2">
          {bottom.map(solo)}
        </div>
      ) : null}
    </nav>
  );
}
