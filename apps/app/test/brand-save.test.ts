import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveBrand } from "@/server/brand";
import { findOrgContext } from "@/server/context";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(plan: "free" | "pro") {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  const ownerRole = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });
  if (plan === "pro")
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE" },
    });
  return {
    org,
    ctx: {
      ...(await findOrgContext(owner.id, org.slug))!,
      user: { id: owner.id, name: owner.name ?? "", email: owner.email },
    },
  };
}

describe("configurateur de marque (US-BRD-01, US-BRD-02)", () => {
  it("réservé à Pro ; couleur invalide refusée ; marque enregistrée puis modifiée", async () => {
    const free = await setup("free");
    await expect(
      saveBrand(free.ctx, { displayName: "Club", hideEvolyBranding: false }),
    ).rejects.toMatchObject({ code: "PRO_REQUIRED" });
    const s = await setup("pro");
    await expect(
      saveBrand(s.ctx, { primaryColor: "rouge", hideEvolyBranding: false }),
    ).rejects.toMatchObject({ code: "BRAND_COLOR_INVALID" });
    await saveBrand(s.ctx, {
      displayName: "Club de Mouscron",
      primaryColor: "#e11d48",
      emailFromName: "Club de Mouscron",
      hideEvolyBranding: false,
    });
    expect(
      await db.organizationBrand.findUniqueOrThrow({
        where: { organizationId: s.org.id },
      }),
    ).toMatchObject({
      displayName: "Club de Mouscron",
      emailFromName: "Club de Mouscron",
    });
    await saveBrand(s.ctx, {
      displayName: "Club de Mouscron 2027",
      hideEvolyBranding: false,
    });
    expect(
      (
        await db.organizationBrand.findUniqueOrThrow({
          where: { organizationId: s.org.id },
        })
      ).displayName,
    ).toBe("Club de Mouscron 2027");
  });
});
