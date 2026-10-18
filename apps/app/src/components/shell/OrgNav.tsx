import { can, hasFeature } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { NAV } from "./nav";
import { SideNav, type NavIcon, type NavSection } from "./SideNav";

const GROUPS: Array<{ group: "pilot" | "grow" | "org"; label: "groupPilot" | "groupGrow" | "groupOrg"; icon: NavIcon }> = [
  { group: "pilot", label: "groupPilot", icon: "pilot" },
  { group: "grow", label: "groupGrow", icon: "grow" },
  { group: "org", label: "groupOrg", icon: "org" },
];

/** Barre de l'organisation : Piloter, Développer, Organisation (arborescence validée le 18 octobre 2026). */
export async function OrgNav({ orgSlug }: { orgSlug: string }) {
  const ctx = await requireOrgContext(orgSlug);
  const [t, tp] = await Promise.all([getTranslations("nav"), getTranslations("plans")]);
  const base = `/o/${ctx.organization.slug}`;
  const visible = NAV.filter((i) => i.anyOf.length === 0 || i.anyOf.some((p) => can(ctx.membership, p)));
  const sections: NavSection[] = GROUPS.map(({ group, label, icon }) => ({
    label: t(label),
    icon,
    items: visible
      .filter((i) => i.group === group)
      .map((i) => ({
        label: t(i.key),
        href: `${base}${i.href}`,
        exact: i.href === "",
        pro: i.feature && !hasFeature(ctx.features, i.feature) ? tp("pro") : undefined,
      })),
  })).filter((s) => s.items.length > 0);
  return <SideNav label={t("main")} sections={sections} />;
}
