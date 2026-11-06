"use client";

import type { ReactNode } from "react";
import { Logo } from "../Brand";
import { useTranslations } from "next-intl";
import { TabBarExtras } from "./TabBar";

/**
 * Coquille de l'espace organisateur : sur ordinateur, une barre latérale charbon (refonte A3, docs/DECISIONS.md) ;
 * sur téléphone, une barre d'onglets flottante (organisation ou événement), avec
 * le sélecteur d'organisation et le compte dans sa feuille « Plus ».
 */
export function Shell({
  nav,
  orgSwitcher,
  account,
  bell,
  accountName,
  header,
  tabBar,
  children,
}: {
  nav: ReactNode;
  orgSwitcher: ReactNode;
  account: ReactNode;
  bell?: ReactNode;
  /** Nom affiché dans la rangée du compte, en bas de la barre (refonte A3). */
  accountName?: string;
  /** Bande d'en-tête pleine largeur au-dessus du contenu (en-tête d'un événement). */
  header?: ReactNode;
  /** Barre d'onglets du téléphone (emplacement parallèle, selon la page). */
  tabBar?: ReactNode;
  children: ReactNode;
}) {
  const accountLabel = useTranslations("nav")("tabBarAccount");
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="theme-sidebar hidden px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-2">
        <div className="px-2.5 pt-1 pb-2">
          <Logo className="h-8 w-auto text-ink" />
        </div>
        {orgSwitcher}
        {/* -mx-3 px-3 : le trait rose de la page active touche le bord de la barre sans être coupé par le défilement */}
        <div className="-mx-3 mt-2 flex-1 overflow-y-auto px-3">{nav}</div>
        {/* refonte A3 : le bas de la barre se réduit à une rangée, le compte (menu qui s'ouvre vers le haut) et les notifications */}
        <div className="flex items-center gap-1 pt-2">
          <details className="group relative min-w-0 flex-1">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2.5 rounded-[10px] px-2 hover:bg-surface group-open:bg-surface [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-[0.6875rem] font-semibold text-ink-muted"
              >
                {(accountName ?? "")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]!.toUpperCase())
                  .join("")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.84375rem] font-medium">
                {accountName ?? accountLabel}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0 text-ink-muted"
              >
                <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
              </svg>
            </summary>
            <div className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-lg bg-surface-raised p-2 shadow-lg ring-1 ring-line">
              {account}
            </div>
          </details>
          {bell}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface-raised px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 text-ink lg:hidden">
        <Logo className="h-7 w-auto text-ink" />
        <span className="ml-auto">{bell}</span>
      </header>

      <div className="min-w-0">
        {header}
        <main className="px-4 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+10rem)] sm:px-8 lg:px-10 lg:pt-6 lg:pb-[max(env(safe-area-inset-bottom),2.5rem)]">
          <div className="mx-auto max-w-[var(--content-max)]">{children}</div>
        </main>
      </div>
      <TabBarExtras.Provider
        value={
          <>
            {orgSwitcher}
            {/* le compte, replié : il s'ouvre d'un toucher (nom, langue, déconnexion, sécurité) */}
            <details className="group rounded-[1rem] bg-surface-raised px-3 py-1 shadow-[inset_0_0_0_1px_var(--line)]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-sm [&::-webkit-details-marker]:hidden">
                {accountLabel}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 transition-transform group-open:rotate-180"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="pb-2">{account}</div>
            </details>
          </>
        }
      >
        {tabBar}
      </TabBarExtras.Provider>
    </div>
  );
}
