import type { EventTab } from "./eventTabs";
import type { NavIcon } from "./SideNav";

/** Onglet de la barre du téléphone : actif sur sa page, ou sous l'une de ses adresses. */
export interface TabBarTab {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  /** Actif seulement sur sa propre adresse (accueil, aperçu d'un événement). */
  exact?: boolean;
  /** Autres adresses qui rendent l'onglet actif (pages de sa partie). */
  under?: string[];
}
export interface TabBarLink {
  label: string;
  href: string;
  pro?: string;
}
/** Feuille « Plus » : le reste de la navigation, par partie. */
export interface TabBarSection {
  label: string;
  items: TabBarLink[];
}

/** Onglet actif d'après l'adresse de la page ; aucun : la page est dans « Plus ». */
export function activeTab(tabs: TabBarTab[], pathname: string): string | null {
  const path = pathname.replace(/\/$/, "");
  const at = (href: string) => path === href || path.startsWith(`${href}/`);
  for (const tab of tabs) {
    if (tab.exact ? path === tab.href : at(tab.href)) return tab.key;
    if (tab.under?.some(at)) return tab.key;
  }
  return null;
}

/** Organisation : Accueil, Événements, Commandes, Finances en onglets (selon les droits), le reste dans « Plus ». */
export const ORG_TABS = ["home", "events", "orders", "finances"] as const;

/**
 * Événement : Aperçu, Billetterie, Participants, Jour J en onglets ; Vente et
 * promotion, Réglages et les autres pages de chaque partie dans « Plus ».
 */
export function eventTabBar(
  tabs: EventTab[],
  labels: { overview: string },
): { tabs: TabBarTab[]; more: TabBarSection[] } {
  const ICON: Partial<Record<EventTab["key"], NavIcon>> = {
    overview: "grid",
    ticketing: "ticket",
    attendees: "users",
    dayOf: "door",
  };
  const primary: TabBarTab[] = [];
  const more: TabBarSection[] = [];
  for (const tab of tabs) {
    const icon = ICON[tab.key];
    if (!icon) {
      more.push({
        label: tab.label,
        items: tab.items.length
          ? tab.items.map((i) => ({ label: i.label, href: i.href }))
          : [{ label: tab.label, href: tab.href }],
      });
      continue;
    }
    const first = tab.items[0];
    primary.push({
      key: tab.key,
      label: tab.key === "overview" ? labels.overview : tab.label,
      href: first?.href ?? tab.href,
      icon,
      exact: tab.key === "overview",
      under: tab.items.map((i) => i.href),
    });
    const rest = tab.items.slice(1);
    if (rest.length)
      more.push({
        label: tab.label,
        items: rest.map((i) => ({ label: i.label, href: i.href })),
      });
  }
  return { tabs: primary, more };
}
