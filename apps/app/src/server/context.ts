import "server-only";
import { PERMISSIONS,  effectivePlan, isReadOnlyOrganization, type MembershipInput, type Permission, type PlanFeature, type PlanId, type SystemRole } from "@evoly/core";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getPlans } from "./plans";
import { requireUser } from "./session";

export interface OrgContext {
  user: { id: string; name: string; email: string };
  organization: {
    id: string;
    slug: string;
    name: string;
    country: string;
    currency: string;
    locale: string;
    timezone: string;
    subdomain: string | null;
    contactEmail: string | null;
  };
  membership: MembershipInput & { roleName: string };
  plan: PlanId;
  features: readonly PlanFeature[];
  readOnly: boolean;
  /** Suspendue par Evoly : lecture seule, ventes interrompues. */
  suspended?: boolean;
  /** Consultation par le support d'Evoly : lecture seule, journalisée. */
  supportView?: boolean;
  stripe: { status: string; chargesEnabled: boolean; payoutsEnabled: boolean; requirementsDue: string[] } | null;
}

/** Charge l'organisation par son identifiant d'URL, uniquement si l'utilisateur en est membre actif (RG-ARC-07). */
export async function findOrgContext(userId: string, orgSlug: string, opts: { supportView?: boolean } = {}): Promise<Omit<OrgContext, "user"> | null> {
  // organisation suspendue : ses membres la voient en lecture seule (section 9.24)
  const found = opts.supportView
    ? null
    : await db.organizationMember.findFirst({
        where: { userId, status: "ACTIVE", organization: { slug: orgSlug, status: { in: ["ACTIVE", "SUSPENDED"] }, deletedAt: null } },
        include: { role: true, organization: { include: { subscription: true, stripeAccount: true } } },
      });
  const supportOrg = opts.supportView ? await db.organization.findFirst({ where: { slug: orgSlug, deletedAt: null }, include: { subscription: true, stripeAccount: true } }) : null;
  if (!found && !supportOrg) return null;
  // consultation support : tout voir, rien modifier (les actions exigent d'être membre)
  const member = found ?? { status: "ACTIVE" as const, role: { systemKey: "OWNER" as const, permissions: [...PERMISSIONS], name: "Support Evoly" }, organization: supportOrg! };
  const o = member.organization;
  const now = new Date();
  const plan = effectivePlan(o.subscription ? { planId: o.subscription.planId, status: o.subscription.status, currentPeriodEnd: o.subscription.currentPeriodEnd, pastDueSince: o.subscription.pastDueSince } : null, now);
  const plans = await getPlans();
  let readOnly = false;
  if (plan === "free") {
    // RG-ORG-04 : seule la plus ancienne organisation Free du propriétaire reste modifiable
    const owner = await db.organizationMember.findFirst({ where: { organizationId: o.id, role: { systemKey: "OWNER" } }, select: { userId: true } });
    if (owner) {
      const firstFree = await db.organization.findFirst({
        where: { deletedAt: null, members: { some: { userId: owner.userId, role: { systemKey: "OWNER" } } }, OR: [{ subscription: null }, { subscription: { planId: "free" } }, { subscription: { status: { in: ["NONE", "CANCELED", "UNPAID", "INCOMPLETE"] } } }] },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      readOnly = isReadOnlyOrganization({ plan, isOwnersFirstFreeOrganization: !firstFree || firstFree.id === o.id });
    }
  }
  const sa = o.stripeAccount;
  // RG-SUB-08 : en Free, seuls les propriétaires accèdent ; les autres membres sont suspendus sans perdre leur rôle
  if (!opts.supportView && !plans[plan].features.includes("TEAM_MEMBERS") && member.role.systemKey !== "OWNER") return null;
  if (o.status === "SUSPENDED" || opts.supportView) readOnly = true;
  return {
    organization: { id: o.id, slug: o.slug, name: o.name, country: o.country, currency: o.currency, locale: o.locale, timezone: o.timezone, subdomain: o.subdomain, contactEmail: o.contactEmail },
    membership: { status: member.status, systemRole: (member.role.systemKey ?? null) as SystemRole | null, permissions: member.role.permissions as Permission[], roleName: member.role.name },
    plan,
    features: plans[plan].features,
    readOnly,
    suspended: o.status === "SUSPENDED",
    supportView: !!opts.supportView,
    stripe: sa ? { status: sa.status, chargesEnabled: sa.chargesEnabled, payoutsEnabled: sa.payoutsEnabled, requirementsDue: Array.isArray(sa.requirementsDue) ? (sa.requirementsDue as string[]) : [] } : null,
  };
}

/** Pour les pages : 404 si l'organisation n'existe pas ou si l'utilisateur n'en est pas membre. */
export const requireOrgContext = cache(async (orgSlug: string): Promise<OrgContext> => {
  const session = await requireUser();
  let ctx = await findOrgContext(session.user.id, orgSlug);
  if (!ctx) {
    const { supportViewAllowed } = await import("./platform");
    if (await supportViewAllowed(orgSlug)) ctx = await findOrgContext(session.user.id, orgSlug, { supportView: true });
  }
  if (!ctx) notFound();
  return { user: { id: session.user.id, name: session.user.name, email: session.user.email }, ...ctx };
});

/** Contexte d'organisation pour une route (téléchargements) : session courante, membre actif, sinon null. */
export async function orgContextFromSession(orgSlug: string): Promise<OrgContext | null> {
  const { getSession } = await import("./session");
  const session = await getSession();
  if (!session?.user) return null;
  const ctx = await findOrgContext(session.user.id, orgSlug);
  return ctx ? ({ ...ctx, user: session.user } as OrgContext) : null;
}
