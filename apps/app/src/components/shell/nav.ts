import type { Permission, PlanFeature } from "@evoly/core";

export interface NavItem {
  key: "home" | "events" | "orders" | "resale" | "marketing" | "finances" | "members" | "brand" | "billing" | "settings";
  href: string;
  /** Au moins une de ces permissions pour voir l'entrée. Vide : visible par tous les membres. */
  anyOf: Permission[];
  /** Fonctionnalité Pro : l'entrée reste visible, avec un badge Pro, si l'offre ne l'inclut pas. */
  feature?: PlanFeature;
  group: "main" | "admin";
}

/** Navigation du tableau de bord (CDC 9.4). */
export const NAV: readonly NavItem[] = [
  { key: "home", href: "", anyOf: [], group: "main" },
  { key: "events", href: "/events", anyOf: ["EVENTS_CREATE", "EVENTS_EDIT", "STATS_VIEW", "CHECKIN_MANAGE"], group: "main" },
  { key: "orders", href: "/orders", anyOf: ["ORDERS_VIEW"], group: "main" },
  { key: "resale", href: "/resale", anyOf: ["RESALE_MANAGE", "ORDERS_VIEW"], group: "main" },
  { key: "marketing", href: "/marketing", anyOf: ["MARKETING_MANAGE"], feature: "EMAIL_MARKETING", group: "main" },
  { key: "finances", href: "/finances", anyOf: ["FINANCE_VIEW"], group: "main" },
  { key: "members", href: "/members", anyOf: ["MEMBERS_MANAGE", "ROLES_MANAGE"], feature: "TEAM_MEMBERS", group: "admin" },
  { key: "brand", href: "/brand", anyOf: ["BRAND_EDIT", "DOMAINS_MANAGE"], feature: "BRANDING", group: "admin" },
  { key: "billing", href: "/billing", anyOf: ["BILLING_MANAGE"], group: "admin" },
  { key: "settings", href: "/settings", anyOf: ["ORG_SETTINGS_EDIT", "PAYMENTS_MANAGE"], group: "admin" },
];
