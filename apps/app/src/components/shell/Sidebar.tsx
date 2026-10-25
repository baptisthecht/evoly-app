"use client";

import type { ReactNode } from "react";
import { Logo } from "../Brand";
import { TabBarExtras } from "./TabBar";

/**
 * Coquille de l'espace organisateur : sur ordinateur, une barre latérale claire ;
 * sur téléphone, une barre d'onglets flottante (organisation ou événement), avec
 * le sélecteur d'organisation et le compte dans sa feuille « Plus ».
 */
export function Shell({
  nav,
  orgSwitcher,
  account,
  bell,
  header,
  tabBar,
  children,
}: {
  nav: ReactNode;
  orgSwitcher: ReactNode;
  account: ReactNode;
  bell?: ReactNode;
  /** Bande d'en-tête pleine largeur au-dessus du contenu (en-tête d'un événement). */
  header?: ReactNode;
  /** Barre d'onglets du téléphone (emplacement parallèle, selon la page). */
  tabBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface-raised px-3 py-4 text-ink lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-2">
        <div className="px-2.5 pt-1 pb-2">
          <Logo className="h-8 w-auto text-ink" />
        </div>
        {orgSwitcher}
        <div className="-mx-1 mt-2 flex-1 overflow-y-auto px-1">{nav}</div>
        <div className="grid gap-1 border-t border-line pt-2">
          {bell}
          {account}
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
            {account}
          </>
        }
      >
        {tabBar}
      </TabBarExtras.Provider>
    </div>
  );
}
