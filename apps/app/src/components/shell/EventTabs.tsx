"use client";

import { ButtonTabs } from "@/components/ui/ButtonTabs";
import type { ReactNode } from "react";
import { UnderlineTabs, underlineTab } from "./SectionTabs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  activeEventTab,
  type EventTab,
  type HiddenFeature,
} from "./eventTabItems";
import { PlusIcon } from "@/components/ui/icons";

const under = (path: string, href: string) =>
  path === href || path.startsWith(`${href}/`);

function useActive(tabs: EventTab[], hidden: HiddenFeature[]) {
  const path = (usePathname() ?? "").replace(/\/$/, "");
  const active = activeEventTab(tabs, hidden, path);
  const tab = tabs.find((x) => x.key === active)!;
  const here = hidden.find((h) => h.tab === active && under(path, h.href));
  return {
    path,
    active,
    items: here
      ? [...tab.items, { label: here.label, href: here.href }]
      : tab.items,
    toAdd: hidden.filter((h) => h.tab === active && h !== here),
  };
}

/** Rangée principale des onglets, dans la bande d'en-tête : le trait de l'onglet actif repose sur son filet. */
export function EventTabs({
  tabs,
  hidden,
}: {
  tabs: EventTab[];
  hidden: HiddenFeature[];
}) {
  const t = useTranslations("nav");
  const { active } = useActive(tabs, hidden);
  return (
    <UnderlineTabs label={t("eventSections")}>
      {tabs.map((x) => (
        <Link
          key={x.key}
          href={x.href}
          aria-current={x.key === active ? "page" : undefined}
          className={underlineTab(x.key === active)}
        >
          {x.label}
        </Link>
      ))}
    </UnderlineTabs>
  );
}

/** Pages de la partie ouverte (seconde rangée, dans le contenu), avec les fonctionnalités à ajouter. */
export function EventSubTabs({
  tabs,
  hidden,
}: {
  tabs: EventTab[];
  hidden: HiddenFeature[];
}) {
  const t = useTranslations("nav");
  const { items, toAdd } = useActive(tabs, hidden);
  if (items.length <= 1 && !toAdd.length) return null;
  // refonte A3 (maquettes UIUX/) : la rangée de la page, onglets en boutons à gauche ; le bouton de la page (BarActions)
  // se place à droite sur la même ligne, dans la grille de la mise en page de l'événement
  return (
    <div
      data-subtabs=""
      className="flex min-w-0 flex-wrap items-center gap-2 sm:col-start-1 sm:row-start-1"
    >
      <ButtonTabs
        label={t("sectionPages")}
        items={items.map((i) => ({ href: i.href, label: i.label }))}
      />
      {toAdd.length ? (
        <details className="relative">
          <summary className="inline-flex h-[34px] cursor-pointer list-none items-center gap-[7px] rounded-[8px] border border-dashed border-line-strong px-[13px] text-[13.5px] text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <PlusIcon className="size-[15px] shrink-0" />
            {t("addFeature")}
          </summary>
          <ul className="absolute z-20 mt-1.5 grid w-72 gap-px rounded-[10px] bg-surface-raised p-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)] ring-1 ring-line">
            {toAdd.map((h) => (
              <li key={h.key}>
                <Link
                  href={h.href}
                  className="grid rounded-[7px] px-2 py-1.5 hover:bg-surface-hover"
                >
                  <span className="text-[13.5px] font-medium">{h.label}</span>
                  <span className="text-[12.5px] text-ink-muted">{h.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Boutons de la page, à droite des onglets en boutons (rangée « .bar » des maquettes) : « Nouveau tarif », « Enregistré »…
 * À placer en premier dans la page ; sur téléphone, sous les onglets.
 */
export function BarActions({ children }: { children: ReactNode }) {
  return (
    <div
      data-bar=""
      className="flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-1 sm:justify-self-end"
    >
      {children}
    </div>
  );
}
