import { can, hasFeature } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { NAV } from "./nav";
import { TabBar } from "./TabBar";
import { ORG_TABS, type TabBarSection, type TabBarTab } from "./tabBar";

/** Barre du téléphone dans l'organisation : Accueil, Événements, Commandes, Finances, puis « Plus » (selon les droits). */
export async function OrgTabBar({ orgSlug }: { orgSlug: string }) {
  const ctx = await requireOrgContext(orgSlug);
  const [t, tp] = await Promise.all([
    getTranslations("nav"),
    getTranslations("plans"),
  ]);
  const base = `/o/${ctx.organization.slug}`;
  const visible = NAV.filter(
    (i) => i.anyOf.length === 0 || i.anyOf.some((p) => can(ctx.membership, p)),
  );
  const primary = new Set<string>(ORG_TABS);
  const tabs: TabBarTab[] = visible
    .filter((i) => primary.has(i.key))
    .map((i) => ({
      key: i.key,
      label: t(i.key),
      href: `${base}${i.href}`,
      icon: i.icon,
      exact: i.href === "",
    }));
  const groups = [
    ["pilot", "groupPilot"],
    ["grow", "groupGrow"],
    ["org", "groupOrg"],
  ] as const;
  const more: TabBarSection[] = groups
    .map(([group, label]) => ({
      label: t(label),
      items: visible
        .filter((i) => i.group === group && !primary.has(i.key))
        .map((i) => ({
          label: t(i.key),
          href: `${base}${i.href}`,
          pro:
            i.feature && !hasFeature(ctx.features, i.feature)
              ? tp("pro")
              : undefined,
        })),
    }))
    .filter((s) => s.items.length > 0);
  return <TabBar label={t("tabBarOrg")} tabs={tabs} more={more} />;
}
