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
  orgSwitcherPhone,
  account,
  bell,
  header,
  tabBar,
  children,
}: {
  nav: ReactNode;
  orgSwitcher: ReactNode;
  /** Le sélecteur sans le compte, pour la feuille « Plus » du téléphone (qui montre le compte à part). */
  orgSwitcherPhone?: ReactNode;
  account: ReactNode;
  /** Notifications : dans la feuille « Plus » du téléphone (sur ordinateur, dans le menu de l'organisation). */
  bell?: ReactNode;
  /** Bande d'en-tête pleine largeur au-dessus du contenu (en-tête d'un événement). */
  header?: ReactNode;
  /** Barre d'onglets du téléphone (emplacement parallèle, selon la page). */
  tabBar?: ReactNode;
  children: ReactNode;
}) {
  const accountLabel = useTranslations("nav")("tabBarAccount");
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* refonte A3 (maquettes UIUX/) : 232 px, le logo, le sélecteur d'organisation, la liste des pages ; rien en bas */}
      <aside className="theme-sidebar hidden px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-0.5">
        <div className="mx-2 mt-0.5 mb-[18px] h-[32.4px]">
          <Logo className="h-8 w-auto text-ink" />
        </div>
        <div className="mb-2.5">{orgSwitcher}</div>
        {/* -mx-3 px-3 : le trait rose de la page active touche le bord de la barre sans être coupé par le défilement */}
        <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3">{nav}</div>
      </aside>

      {/* sur téléphone (maquette « Sur téléphone ») : pas de barre en haut, la page commence par son titre ; la cloche
          est dans la feuille « Plus » */}
      <div className="min-w-0 max-lg:pt-[env(safe-area-inset-top,0px)]">
        {header}
        <main className="px-[18px] pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] sm:px-8 lg:px-7 lg:pt-[22px] lg:pb-[max(env(safe-area-inset-bottom),22px)]">
          <div className="mx-auto max-w-[var(--content-max)]">{children}</div>
        </main>
      </div>
      <TabBarExtras.Provider
        value={
          <>
            {orgSwitcherPhone ?? orgSwitcher}
            {bell}
            {/* le compte, replié : il s'ouvre d'un toucher (nom, langue, déconnexion, sécurité) */}
            <details className="group rounded-[10px] bg-surface-raised px-3 py-1 shadow-[inset_0_0_0_1px_var(--line)]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
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
