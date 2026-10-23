import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  addEmbedOrigin,
  embedOriginsFor,
  normalizeOrigin,
  removeEmbedOrigin,
} from "@/server/embed";

const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(plan: "pro" | "free") {
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
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * 86_400_000),
      status: "PUBLISHED",
    },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  return { org, event, ctx };
}

describe("billetterie intégrable (section 9.26)", () => {
  it("adresses des sites autorisés : HTTPS seulement, réduites au site (RG-EMB-01)", () => {
    expect(normalizeOrigin("monclub.be")).toBe("https://monclub.be");
    expect(normalizeOrigin("https://www.MonClub.be/billets?x=1")).toBe(
      "https://www.monclub.be",
    );
    expect(normalizeOrigin("https://monclub.be:8443/")).toBe(
      "https://monclub.be:8443",
    );
    expect(normalizeOrigin("http://monclub.be")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("https://user:mdp@monclub.be")).toBeNull();
    expect(normalizeOrigin("localhost")).toBeNull();
    expect(buildCsp()).toContain("frame-ancestors 'none'");
    expect(buildCsp("https://monclub.be")).toContain(
      "frame-ancestors https://monclub.be",
    );
  });

  it("réservé à Pro : sites déclarés seulement en Pro, et aucun site autorisé si l'organisation repasse en Free (RG-EMB-05)", async () => {
    const free = await setup("free");
    await expect(addEmbedOrigin(free.ctx, "monclub.be")).rejects.toMatchObject({
      code: "FEATURE_UNAVAILABLE",
    });
    const s = await setup("pro");
    expect(await addEmbedOrigin(s.ctx, "monclub.be")).toEqual([
      "https://monclub.be",
    ]);
    expect(await addEmbedOrigin(s.ctx, "https://monclub.be/")).toEqual([
      "https://monclub.be",
    ]); // pas de doublon
    await expect(
      addEmbedOrigin(s.ctx, "http://monclub.be"),
    ).rejects.toMatchObject({ code: "EMBED_ORIGIN_INVALID" });
    expect(await embedOriginsFor(s.event.id)).toEqual(["https://monclub.be"]);
    await db.subscription.update({
      where: { organizationId: s.org.id },
      data: { planId: "free", status: "NONE" },
    });
    expect(await embedOriginsFor(s.event.id)).toEqual([]);
    await removeEmbedOrigin(s.ctx, "https://monclub.be");
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: s.org.id } }))
        .embedOrigins,
    ).toEqual([]);
  });
});
