import { can, hasFeature } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { NAV } from "./nav";
import { SideNav, type NavSection } from "./SideNav";

/**
 * Barre de l'organisation (refonte A3, maquettes UIUX/) : une seule liste, sans titres de catégorie, dans l'ordre de
 * NAV ; « Événements » porte le nombre d'événements à venir (comme l'onglet « À venir »).
 */
export async function OrgNav({ orgSlug }: { orgSlug: string }) {
  const ctx = await requireOrgContext(orgSlug);
  const [t, tp] = await Promise.all([
    getTranslations("nav"),
    getTranslations("plans"),
  ]);
  const base = `/o/${ctx.organization.slug}`;
  const visible = NAV.filter(
    (i) => i.anyOf.length === 0 || i.anyOf.some((p) => can(ctx.membership, p)),
  );
  // le nombre de l'onglet « À venir » de la page Événements (maquettes UIUX/ : 4 et 4), brouillons non compris
  const upcoming = await db.event.count({
    where: {
      organizationId: ctx.organization.id,
      deletedAt: null,
      status: { in: ["PUBLISHED", "SALES_PAUSED"] },
      startsAt: { gte: new Date() },
    },
  });
  const sections: NavSection[] = [
    {
      label: "",
      icon: "pilot",
      items: visible.map((i) => ({
        label: t(i.key),
        href: `${base}${i.href}`,
        exact: i.href === "",
        icon: i.icon,
        count: i.key === "events" ? upcoming : undefined,
        pro:
          i.feature && !hasFeature(ctx.features, i.feature)
            ? tp("pro")
            : undefined,
      })),
    },
  ];
  return <SideNav label={t("main")} sections={sections} />;
}
