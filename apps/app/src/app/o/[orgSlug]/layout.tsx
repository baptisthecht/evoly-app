import { can, hasFeature } from "@evoly/core";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { NAV } from "@/components/shell/nav";
import { OrgSwitcher } from "@/components/shell/OrgSwitcher";
import { Shell, type SidebarLink } from "@/components/shell/Sidebar";
import { getTranslations } from "next-intl/server";
import { daysBeforeDowngrade } from "@evoly/core";
import Link from "next/link";
import { unreadCount } from "@/server/notifications";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";

export default async function OrgLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  // RG-AUTH-07 : mémorise la dernière organisation ouverte
  await db.session.updateMany({ where: { userId: ctx.user.id, activeOrganizationId: { not: ctx.organization.id } }, data: { activeOrganizationId: ctx.organization.id } });
  const base = `/o/${ctx.organization.slug}`;
  const links: SidebarLink[] = NAV.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => can(ctx.membership, p))).map((item) => ({
    key: item.key,
    href: `${base}${item.href}`,
    group: item.group,
    pro: !!item.feature && !hasFeature(ctx.features, item.feature),
  }));
  // RG-SUB-06 : bandeau d'impayé dans tout le tableau de bord
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organization.id }, select: { status: true, pastDueSince: true } });
  const days = sub ? daysBeforeDowngrade(sub, new Date()) : null;
  const pastDue = days != null ? (await getTranslations("billing"))("pastDueBanner", { count: days }) : null;
  const unread = await unreadCount(ctx.organization.id, ctx.user.id); // section 9.20
  return (
    <Shell
      bell={
        <Link href={`/o/${ctx.organization.slug}/notifications`} aria-label={(await getTranslations("notifications"))("bell", { count: unread })} className="relative inline-flex h-11 items-center gap-2 rounded-full bg-blanc/10 px-3 text-sm font-semibold text-creme lg:w-full lg:px-4">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          <span className="hidden lg:inline">{(await getTranslations("notifications"))("title")}</span>
          {unread > 0 ? <span className="ml-auto rounded-full bg-rose px-2 py-0.5 text-xs font-bold text-charbon" data-testid="unread-count">{unread > 99 ? "99+" : unread}</span> : null}
        </Link>
      }
      links={links}
      orgSwitcher={<OrgSwitcher userId={ctx.user.id} currentSlug={ctx.organization.slug} currentName={ctx.organization.name} />}
      account={
        <>
          <AccountMenu name={ctx.user.name} email={ctx.user.email} />
          <Link href="/compte/securite" className="mt-1 block rounded-full px-3 py-2 text-sm text-creme/80 hover:text-creme">
            {(await getTranslations("twoFactor"))("accountLink")}
          </Link>
        </>
      }
    >
      {pastDue ? (
        <a href={`/o/${orgSlug}/billing`} className="mb-6 flex items-center justify-between gap-3 rounded-lg bg-danger-soft px-5 py-4 font-semibold text-danger" role="alert">
          <span>{pastDue}</span>
          <span aria-hidden="true">→</span>
        </a>
      ) : null}
      {ctx.supportView ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--evoly-lilas)] px-5 py-4 font-semibold text-[var(--evoly-charbon)]" role="status">
          <span>Consultation support Evoly en lecture seule : aucune modification possible, accès journalisé.</span>
          <a href="/admin/quitter" className="underline underline-offset-4">Quitter la consultation</a>
        </div>
      ) : null}
      {ctx.suspended && !ctx.supportView ? (
        <p className="mb-6 rounded-lg bg-danger-soft px-5 py-4 font-semibold text-danger" role="alert">
          {(await getTranslations("platform"))("suspendedBanner")}
        </p>
      ) : null}
      {children}
    </Shell>
  );
}
