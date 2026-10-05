import { describe, expect, it } from "vitest";
import { effectivePlan } from "@evoly/core";
import { db } from "@/lib/db";
import { attachReferral, qualifyReferral, referralLink } from "@/server/referrals";

const rid = () => Math.random().toString(36).slice(2, 10);
async function orgOwnedBy(userId: string, label: string) {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: `${label} ${id}`,
      slug: `${label}-${id}`,
      subdomain: `${label}-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  await db.organizationMember.create({
    data: { organizationId: org.id, userId, roleId: (await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } })).id },
  });
  return org;
}
const user = (n: string) => db.user.create({ data: { name: n, email: `${n}.${rid()}@exemple.be`, emailVerified: true } });

describe("parrainage (section 9.22, RG-PAR-01)", () => {
  it("rattachement, jamais pour le même propriétaire ; un mois de Pro une seule fois, à la première vente payante", async () => {
    const [ua, ub] = await Promise.all([user("parrain"), user("filleul")]);
    const a = await orgOwnedBy(ua.id, "atelier");
    const link = await referralLink(a.id);
    expect(link.url).toContain(`/register?ref=${link.code}`);
    const sameOwner = await orgOwnedBy(ua.id, "autre");
    await attachReferral(sameOwner.id, ua.id, link.code);
    expect(await db.referral.count({ where: { referredOrgId: sameOwner.id } })).toBe(0);
    const b = await orgOwnedBy(ub.id, "club");
    await attachReferral(b.id, ub.id, link.code.toUpperCase());
    await attachReferral(b.id, ub.id, link.code); // deuxième tentative : ignorée
    expect(await db.referral.findUniqueOrThrow({ where: { referredOrgId: b.id } })).toMatchObject({ referrerOrgId: a.id, status: "SIGNED_UP" });
    const now = new Date();
    expect(await qualifyReferral(b.id, now)).toBe(true);
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: a.id } });
    expect(effectivePlan(sub, new Date(now.getTime() + 29 * 86_400_000))).toBe("pro");
    expect(effectivePlan(sub, new Date(now.getTime() + 31 * 86_400_000))).toBe("free");
    expect(await qualifyReferral(b.id, now)).toBe(false); // une seule récompense par organisation parrainée
    expect(await db.referral.findUniqueOrThrow({ where: { referredOrgId: b.id } })).toMatchObject({ status: "REWARDED" });
    expect(await db.emailMessage.count({ where: { organizationId: a.id, template: "referral.rewarded" } })).toBe(1);
    expect(await referralLink(a.id)).toMatchObject({ signedUp: 1, qualified: 1, rewarded: 1 });
  });

  it("parrain déjà en Pro (offre à durée limitée) : 30 jours ajoutés à la suite", async () => {
    const [ua, ub] = await Promise.all([user("parrain"), user("filleul")]);
    const a = await orgOwnedBy(ua.id, "theatre");
    const until = new Date(Date.now() + 10 * 86_400_000);
    await db.subscription.create({ data: { organizationId: a.id, planId: "pro", status: "CANCELED", currentPeriodEnd: until, cancelAtPeriodEnd: true } });
    const b = await orgOwnedBy(ub.id, "chorale");
    await attachReferral(b.id, ub.id, (await referralLink(a.id)).code);
    await qualifyReferral(b.id);
    expect((await db.subscription.findUniqueOrThrow({ where: { organizationId: a.id } })).currentPeriodEnd!.getTime()).toBe(until.getTime() + 30 * 86_400_000);
  });
});
