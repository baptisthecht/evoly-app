import { hasFeature, PERMISSIONS, type Permission } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext, type OrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";
import { saveCustomRole } from "@/server/team";

const rid = () => Math.random().toString(36).slice(2, 10);
const BILLING = "BILLING_MANAGE" as Permission;
const ROLES = "ROLES_MANAGE" as Permission;
const [A, B] = PERMISSIONS.filter((p) => p !== BILLING && p !== ROLES).slice(0, 2) as [Permission, Permission];
const ctxOf = async (userId: string, slug: string) =>
  ({ ...(await findOrgContext(userId, slug))!, user: { id: userId, name: "Membre", email: `${userId}@exemple.be` } }) as OrgContext;

async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Propriétaire", email: `own.${id}@exemple.be`, emailVerified: true } });
  const admin = await db.user.create({ data: { name: "Gestionnaire", email: `adm.${id}@exemple.be`, emailVerified: true } });
  const ownerRole = await db.role.findUniqueOrThrow({ where: { systemKey: "OWNER" } });
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      subscription: { create: { planId: "pro", status: "ACTIVE", currency: "EUR", stripeSubscriptionId: `sub_${id}` } },
      members: { create: { userId: owner.id, roleId: ownerRole.id } },
    },
  });
  const asOwner = await ctxOf(owner.id, org.slug);
  const manager = await saveCustomRole(asOwner, { name: "Gestion", permissions: [ROLES, A, B] }); // pas la facturation
  await db.organizationMember.create({ data: { organizationId: org.id, userId: admin.id, roleId: manager.id } });
  const target = await saveCustomRole(asOwner, { name: "Cible", permissions: [BILLING, A] });
  return { asOwner, asAdmin: await ctxOf(admin.id, org.slug), target };
}
const permsOf = async (id: string) => [...(await db.role.findUniqueOrThrow({ where: { id } })).permissions].sort();

const enabled = hasFeature((await getPlans()).pro.features, "CUSTOM_ROLES"); // rôles personnalisés : fonction Pro

describe("rôles personnalisés : permissions qu'on ne peut pas accorder (RG-ORG-02)", () => {
  it.runIf(enabled)("modifié par un membre sans la facturation : la facturation accordée par le propriétaire est conservée", async () => {
    const s = await setup();
    await saveCustomRole(s.asAdmin, { id: s.target.id, name: "Cible renommée", permissions: [B] }); // la case de la facturation n'est pas envoyée
    expect(await permsOf(s.target.id)).toEqual([BILLING, B].sort()); // A retirée (il l'a), B ajoutée (il l'a), facturation gardée
  });

  it.runIf(enabled)("ce membre ne peut toujours pas accorder une permission qu'il n'a pas", async () => {
    const s = await setup();
    await expect(saveCustomRole(s.asAdmin, { id: s.target.id, name: "Cible", permissions: [BILLING, A] })).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
    await expect(saveCustomRole(s.asAdmin, { name: "Nouveau", permissions: [BILLING] })).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
  });

  it.runIf(enabled)("le propriétaire, qui peut tout accorder, peut aussi tout retirer", async () => {
    const s = await setup();
    await saveCustomRole(s.asOwner, { id: s.target.id, name: "Cible", permissions: [A] });
    expect(await permsOf(s.target.id)).toEqual([A]);
  });
});
