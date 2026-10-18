import type { PlanFeature } from "@evoly/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const conf = vi.hoisted(() => ({
  NEXT_PUBLIC_APP_URL: "https://app.evoly.me",
  NEXT_PUBLIC_BASE_DOMAIN: "evoly.me",
  NEXT_PUBLIC_SHORT_LINK_BASE: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: () => conf }));
const domains = vi.hoisted(() => ({ list: [] as Array<{ domain: string; scope: "EVENT" | "ORGANIZATION" }> }));
vi.mock("@/lib/db", () => ({
  db: { customDomain: { findMany: async () => domains.list, findFirst: async () => domains.list.find((d) => d.scope === "ORGANIZATION") ?? null } },
}));
const { eventPublicUrl, eventShortUrl, organizationPublicUrl } = await import("@/server/urls");
const { canonicalEventUrl, canonicalOrgUrl } = await import("@/server/canonical");

const org = (features: PlanFeature[] = [], subdomain: string | null = "club") => ({ id: "o1", subdomain, slug: "club-slug", features });
beforeEach(() => {
  Object.assign(conf, { NEXT_PUBLIC_APP_URL: "https://app.evoly.me", NEXT_PUBLIC_BASE_DOMAIN: "evoly.me", NEXT_PUBLIC_SHORT_LINK_BASE: undefined });
  domains.list = [];
});

describe("adresses publiques (RG-PUB-07, RG-EVT-09)", () => {
  it("page de l'organisation : protocole et port repris de la configuration", () => {
    expect(organizationPublicUrl("club")).toBe("https://club.evoly.me");
    Object.assign(conf, { NEXT_PUBLIC_APP_URL: "http://app.localhost:3001", NEXT_PUBLIC_BASE_DOMAIN: "localhost:3001" });
    expect(organizationPublicUrl("club")).toBe("http://club.localhost:3001");
  });

  it("événement : son sous-domaine, sinon la page de l'organisation (ou son identifiant sans sous-domaine)", () => {
    expect(eventPublicUrl({ subdomain: "club", slug: "club-slug" }, { slug: "gala", subdomain: "gala" })).toBe("https://gala.evoly.me");
    expect(eventPublicUrl({ subdomain: "club", slug: "club-slug" }, { slug: "gala" })).toBe("https://club.evoly.me/gala");
    expect(eventPublicUrl({ subdomain: null, slug: "club-slug" }, { slug: "gala", subdomain: null })).toBe("https://club-slug.evoly.me/gala");
  });

  it("lien court : sa base dédiée, sinon l'adresse de l'application", () => {
    expect(eventShortUrl("7KQ2XM")).toBe("https://app.evoly.me/e/7KQ2XM");
    conf.NEXT_PUBLIC_SHORT_LINK_BASE = "https://evoly.me";
    expect(eventShortUrl("7KQ2XM")).toBe("https://evoly.me/e/7KQ2XM");
  });
});

describe("adresse canonique (RG-DOM-06) : domaine de l'événement, puis de l'organisation, puis sous-domaines", () => {
  it("le domaine propre de l'événement passe avant celui de l'organisation", async () => {
    domains.list = [
      { domain: "club.be", scope: "ORGANIZATION" },
      { domain: "billets-gala.be", scope: "EVENT" },
    ];
    expect(await canonicalEventUrl(org(["CUSTOM_DOMAINS"]), { id: "e1", slug: "gala" })).toBe("https://billets-gala.be");
    domains.list = [{ domain: "club.be", scope: "ORGANIZATION" }];
    expect(await canonicalEventUrl(org(["CUSTOM_DOMAINS"]), { id: "e1", slug: "gala" })).toBe("https://club.be/gala");
  });

  it("le port de développement suit les domaines personnalisés", async () => {
    Object.assign(conf, { NEXT_PUBLIC_APP_URL: "http://app.localhost:3001", NEXT_PUBLIC_BASE_DOMAIN: "localhost:3001" });
    domains.list = [{ domain: "club.test", scope: "ORGANIZATION" }];
    expect(await canonicalOrgUrl(org(["CUSTOM_DOMAINS"]))).toBe("http://club.test:3001");
  });

  it("sans l'option, les domaines personnalisés sont ignorés ; un sous-domaine d'événement exige son option", async () => {
    domains.list = [
      { domain: "club.be", scope: "ORGANIZATION" },
      { domain: "billets-gala.be", scope: "EVENT" },
    ];
    expect(await canonicalEventUrl(org([]), { id: "e1", slug: "gala", subdomain: "gala" })).toBe("https://club.evoly.me/gala");
    expect(await canonicalEventUrl(org(["EVENT_SUBDOMAINS"]), { id: "e1", slug: "gala", subdomain: "gala" })).toBe("https://gala.evoly.me");
    expect(await canonicalOrgUrl(org([]))).toBe("https://club.evoly.me");
    domains.list = [];
    expect(await canonicalEventUrl(org(["CUSTOM_DOMAINS"]), { id: "e1", slug: "gala" })).toBe("https://club.evoly.me/gala");
    expect(await canonicalOrgUrl(org(["CUSTOM_DOMAINS"], null))).toBe("https://club-slug.evoly.me");
  });
});
