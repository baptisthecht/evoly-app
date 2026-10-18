"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export type NavIcon = "pilot" | "grow" | "org" | "grid" | "ticket" | "megaphone" | "scan" | "users" | "settings" | "back" | "plus";
export interface NavItem {
  label: string;
  href: string;
  exact?: boolean;
  pro?: string;
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
  ticket: <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />,
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
  plus: <path d="M12 5v14M5 12h14" />,
};

export function NavGlyph({ name, className }: { name: NavIcon; className?: string }) {
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
const itemClass = (on: boolean) =>
  cn(
    "flex h-8 items-center gap-2 pr-2.5 text-[0.84rem] transition-colors",
    on
      ? "border-l-2 border-rose pl-[calc(0.75rem-1px)] font-semibold text-ink"
      : "border-l border-line pl-3 font-medium text-ink-muted hover:font-semibold hover:text-ink",
  );
const soloClass = (on: boolean) =>
  cn(
    "flex h-8 items-center gap-2.5 border-l-2 pr-2.5 pl-2 text-[0.84rem] transition-colors",
    on ? "border-rose font-semibold text-ink" : "border-transparent font-medium text-ink-muted hover:font-semibold hover:text-ink",
  );

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
    return i.exact ? pathname === h : pathname === h || pathname.startsWith(`${h}/`);
  };
  const solo = (i: NavSolo) => (
    <Link key={i.href} href={i.href} aria-current={active(i) ? "page" : undefined} className={soloClass(active(i))}>
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
          <div key={s.label} className={cn("grid gap-0.5", n > 0 || top ? "mt-2.5" : "")}>
            <p className={cn("flex h-7 items-center gap-2.5 px-2.5 text-[0.8rem] font-semibold", open ? "text-ink" : "text-ink-muted")}>
              <NavGlyph name={s.icon} />
              {s.label}
            </p>
            <ul className="ml-[1.1rem] grid">
              {s.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} aria-current={active(i) ? "page" : undefined} className={cn(itemClass(active(i)), "justify-between")}>
                    <span className="truncate">{i.label}</span>
                    {i.pro ? <span className="rounded-full bg-surface-sunken px-1.5 py-px font-label text-[0.62rem] font-bold text-ink">{i.pro}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {after}
      {bottom.length > 0 ? <div className="mt-3 grid gap-0.5 border-t border-line pt-2">{bottom.map(solo)}</div> : null}
    </nav>
  );
}
