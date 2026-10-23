import { isReadOnlyOrganization, PERMISSIONS } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";

const rid = () => Math.random().toString(36).slice(2, 10);
const owner = () =>
  db.role.findUniqueOrThrow({ where: { systemKey: "OWNER" } });
const admin = () => db.role.findFirstOrThrow({ where: { systemKey: "ADMIN" } });
const user = () =>
  db.user.create({
    data: {
      name: "Camille",
      email: `u.${rid()}@exemple.be`,
      emailVerified: true,
    },
  });
async function org(
  opts: {
    plan?: "free" | "pro";
    status?: "ACTIVE" | "SUSPENDED" | "DELETED";
    deleted?: boolean;
    createdAt?: Date;
  } = {},
) {
  const id = rid();
  const pro = opts.plan === "pro";
  return db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      status: opts.status ?? "ACTIVE",
      deletedAt: opts.deleted ? new Date() : null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      subscription: {
        create: {
          planId: pro ? "pro" : "free",
          status: pro ? "ACTIVE" : "NONE",
          currency: "EUR",
          stripeSubscriptionId: pro ? `sub_${id}` : null,
        },
      },
    },
  });
}
const join = async (
  organizationId: string,
  userId: string,
  role: "OWNER" | "ADMIN",
  status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
) =>
  db.organizationMember.create({
    data: {
      organizationId,
      userId,
      roleId: (role === "OWNER" ? await owner() : await admin()).id,
      status,
    },
  });

describe("accès à une organisation (RG-ARC-07, RG-SUB-08)", () => {
  it("non-membre, membre suspendu, organisation supprimée : introuvable", async () => {
    const o = await org();
    const u = await user();
    expect(await findOrgContext(u.id, o.slug)).toBeNull();
    await join(o.id, u.id, "OWNER", "SUSPENDED");
    expect(await findOrgContext(u.id, o.slug)).toBeNull();
    const gone = await org({ deleted: true });
    const v = await user();
    await join(gone.id, v.id, "OWNER");
    expect(await findOrgContext(v.id, gone.slug)).toBeNull();
    const closed = await org({ status: "DELETED" });
    await join(closed.id, v.id, "OWNER");
    expect(await findOrgContext(v.id, closed.slug)).toBeNull();
  });

  it("en Free, seul le propriétaire entre ; l'administrateur est tenu dehors sans perdre son rôle", async () => {
    const o = await org();
    const [own, adm] = [await user(), await user()];
    await join(o.id, own.id, "OWNER");
    await join(o.id, adm.id, "ADMIN");
    expect(await findOrgContext(own.id, o.slug)).toMatchObject({
      plan: "free",
      readOnly: false,
      membership: { systemRole: "OWNER" },
    });
    expect(await findOrgContext(adm.id, o.slug)).toBeNull();
    expect(
      await db.organizationMember.count({
        where: { organizationId: o.id, userId: adm.id, status: "ACTIVE" },
      }),
    ).toBe(1);
  });

  it("en Pro, l'administrateur entre avec exactement les permissions de son rôle", async () => {
    const o = await org({ plan: "pro" });
    const adm = await user();
    await join(o.id, adm.id, "ADMIN");
    const role = await admin();
    expect(await findOrgContext(adm.id, o.slug)).toMatchObject({
      plan: "pro",
      readOnly: false,
      membership: {
        systemRole: "ADMIN",
        permissions: role.permissions,
        roleName: role.name,
      },
    });
  });

  it("seconde organisation gratuite d'un même propriétaire : lecture seule ; la première reste modifiable", async () => {
    const own = await user();
    const first = await org({ createdAt: new Date(Date.now() - 86_400_000) });
    const second = await org();
    await join(first.id, own.id, "OWNER");
    await join(second.id, own.id, "OWNER");
    expect((await findOrgContext(own.id, first.slug))!.readOnly).toBe(
      isReadOnlyOrganization({
        plan: "free",
        isOwnersFirstFreeOrganization: true,
      }),
    );
    expect((await findOrgContext(own.id, second.slug))!.readOnly).toBe(
      isReadOnlyOrganization({
        plan: "free",
        isOwnersFirstFreeOrganization: false,
      }),
    );
    expect((await findOrgContext(own.id, first.slug))!.readOnly).toBe(false);
  });

  it("suspendue par Evoly : lecture seule, et signalée comme suspendue", async () => {
    const o = await org({ plan: "pro", status: "SUSPENDED" });
    const own = await user();
    await join(o.id, own.id, "OWNER");
    expect(await findOrgContext(own.id, o.slug)).toMatchObject({
      readOnly: true,
      suspended: true,
      supportView: false,
    });
  });

  it("consultation par le support : tout voir, rien modifier ; une adresse inconnue reste introuvable", async () => {
    const o = await org({ plan: "pro" });
    const agent = await user();
    const ctx = (await findOrgContext(agent.id, o.slug, {
      supportView: true,
    }))!;
    expect(ctx).toMatchObject({
      supportView: true,
      readOnly: true,
      membership: { systemRole: "OWNER", roleName: "Support Evoly" },
    });
    expect(ctx.membership.permissions).toHaveLength(PERMISSIONS.length);
    expect(
      await findOrgContext(agent.id, `inconnue-${rid()}`, {
        supportView: true,
      }),
    ).toBeNull();
  });

  it("compte Stripe : état transmis, exigences en attente listées ; sans compte, rien", async () => {
    const o = await org({ plan: "pro" });
    const own = await user();
    await join(o.id, own.id, "OWNER");
    expect((await findOrgContext(own.id, o.slug))!.stripe).toBeNull();
    await db.stripeAccount.create({
      data: {
        organizationId: o.id,
        stripeAccountId: `acct_${rid()}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "RESTRICTED",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsDue: ["individual.id_number"],
      },
    });
    expect((await findOrgContext(own.id, o.slug))!.stripe).toEqual({
      status: "RESTRICTED",
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsDue: ["individual.id_number"],
    });
  });
});
