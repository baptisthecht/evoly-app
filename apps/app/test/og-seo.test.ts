import { hasFeature } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hasFeatureForOrg } from "@/server/og";
import { getPlans } from "@/server/plans";
import type { SiteResolution } from "@/server/publicEvents";
import {
  appRobots,
  eventOgImageUrl,
  orgOgImageUrl,
  siteRobots,
  siteSitemap,
} from "@/server/seo";
import { organizationPublicUrl } from "@/server/urls";

const rid = () => Math.random().toString(36).slice(2, 10);
const day = 86_400_000;
async function org(sub?: {
  status: "ACTIVE";
  currentPeriodEnd?: Date | null;
  stripeSubscriptionId: string | null;
}) {
  const id = rid();
  return db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      ...(sub
        ? {
            subscription: {
              create: { planId: "pro", currency: "EUR", ...sub },
            },
          }
        : {}),
    },
  });
}

describe("image d'aperçu : marque et mention Evoly selon l'offre effective (RG-BRD-03)", () => {
  it("en Pro : marque appliquée ; mention Evoly retirée seulement si l'organisateur le demande", async () => {
    const pro = (await getPlans()).pro.features;
    const o = await org({
      status: "ACTIVE",
      stripeSubscriptionId: `sub_${rid()}`,
    });
    expect(await hasFeatureForOrg(o.id, true)).toEqual({
      branded: hasFeature(pro, "BRANDING"),
      hidePowered: hasFeature(pro, "REMOVE_EVOLY_BRANDING"),
    });
    expect((await hasFeatureForOrg(o.id, false)).hidePowered).toBe(false);
  });

  it("en Free, et à la fin d'une offre attribuée par Evoly : ni marque ni retrait de la mention", async () => {
    const free = (await getPlans()).free.features;
    const expected = {
      branded: hasFeature(free, "BRANDING"),
      hidePowered: false,
    };
    expect(await hasFeatureForOrg((await org()).id, true)).toEqual(expected);
    const ended = await org({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() - day),
      stripeSubscriptionId: null,
    });
    expect(await hasFeatureForOrg(ended.id, true)).toEqual(expected);
  });
});

describe("référencement des billetteries", () => {
  it("robots.txt : pages publiques et robots d'IA autorisés, billets et API interdits, plan du site annoncé", () => {
    const r = siteRobots("https://club.evoly.me/sitemap.xml");
    expect(r).toContain(
      "User-agent: *\nAllow: /\nDisallow: /billets/\nDisallow: /api/",
    );
    for (const bot of [
      "GPTBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
    ])
      expect(r).toContain(`User-agent: ${bot}`);
    expect(r.endsWith("Sitemap: https://club.evoly.me/sitemap.xml\n")).toBe(
      true,
    );
  });

  it("tableau de bord et espaces privés : jamais indexés", () => {
    expect(appRobots()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("plan du site d'une organisation : sa page et ses événements publics seulement, les prochains en tête de priorité", async () => {
    const o = await org();
    const ev = (slug: string, over: Record<string, unknown>) =>
      db.event.create({
        data: {
          organizationId: o.id,
          slug: `${slug}-${o.id.slice(-6)}`,
          publicCode: rid().toUpperCase().slice(0, 8),
          title: slug,
          currency: "EUR",
          timezone: "Europe/Brussels",
          startsAt: new Date(Date.now() + 10 * day),
          status: "PUBLISHED",
          visibility: "PUBLIC",
          ...over,
        },
      });
    const next = await ev("prochain", {});
    const past = await ev("passe", {
      status: "ENDED",
      startsAt: new Date(Date.now() - 10 * day),
    });
    await ev("brouillon", { status: "DRAFT" });
    await ev("annule", { status: "CANCELLED" });
    await ev("prive", { visibility: "PRIVATE" });
    await ev("programme", { publishAt: new Date(Date.now() + day) });
    const site = {
      kind: "ORG",
      org: { ...o, features: [] },
    } as unknown as SiteResolution;
    const xml = await siteSitemap(site);
    const base = organizationPublicUrl(o.subdomain!);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(
      [base, `${base}/${next.slug}`, `${base}/${past.slug}`].sort(),
    );
    expect(xml).toContain(
      `<loc>${base}/${next.slug}</loc><lastmod>${next.updatedAt.toISOString()}</lastmod><priority>1.0</priority>`,
    );
    expect(xml).toContain(
      `<loc>${base}/${past.slug}</loc><lastmod>${past.updatedAt.toISOString()}</lastmod><priority>0.4</priority>`,
    );
    const latest = [next, past].reduce((a, b) =>
      a.updatedAt > b.updatedAt ? a : b,
    ).updatedAt;
    expect(xml).toContain(
      `<loc>${base}</loc><lastmod>${latest.toISOString()}</lastmod><priority>0.8</priority>`,
    );
  });

  it("plan du site d'un événement : lui seul ; ancienne adresse ou billetterie désactivée : plan vide", async () => {
    const o = await org();
    const a = await db.event.create({
      data: {
        organizationId: o.id,
        slug: `a-${o.id.slice(-6)}`,
        publicCode: rid().toUpperCase().slice(0, 8),
        title: "A",
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + day),
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
    });
    await db.event.create({
      data: {
        organizationId: o.id,
        slug: `b-${o.id.slice(-6)}`,
        publicCode: rid().toUpperCase().slice(0, 8),
        title: "B",
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + day),
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
    });
    const xml = await siteSitemap({
      kind: "EVENT",
      org: { ...o, features: [] },
      eventId: a.id,
    } as unknown as SiteResolution);
    expect([...xml.matchAll(/<loc>/g)]).toHaveLength(1);
    expect(xml).toContain(`/${a.slug}</loc>`);
    for (const site of [
      { kind: "REDIRECT", base: "https://neuf.evoly.me", rootPath: "" },
      { kind: "DISABLED", fallback: null },
    ]) {
      expect(await siteSitemap(site as SiteResolution)).not.toContain("<url>");
    }
  });

  it("images d'aperçu : versionnées par la date de modification, pour rafraîchir les caches des réseaux", () => {
    const d = new Date("2026-10-18T12:00:00Z");
    expect(eventOgImageUrl("e1", d)).toBe(
      `${env().NEXT_PUBLIC_APP_URL}/api/og/event/e1?v=${d.getTime().toString(36)}`,
    );
    expect(orgOgImageUrl("o1")).toBe(
      `${env().NEXT_PUBLIC_APP_URL}/api/og/org/o1`,
    );
  });
});
