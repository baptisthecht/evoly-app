import { beforeEach, describe, expect, it, vi } from "vitest";

const req = vi.hoisted(() => ({ site: "club" as string | null }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(req.site ? { "x-evoly-site": req.site } : {}),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const site = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/server/publicEvents", () => ({
  resolveSite: async () => site.value,
}));

const { assertSiteRequest, siteGate } = await import("@/server/siteGuard");

beforeEach(() => {
  req.site = "club";
  site.value = { kind: "ORGANIZATION", id: "o1" };
});

describe("pages publiques (RG-DOM-01, RG-SDM-03)", () => {
  it("servies seulement par la réécriture d'hôte du proxy", async () => {
    await expect(assertSiteRequest("club")).resolves.toBeUndefined();
    req.site = "autre";
    await expect(assertSiteRequest("club")).rejects.toThrow("NOT_FOUND");
    req.site = null;
    await expect(assertSiteRequest("club")).rejects.toThrow("NOT_FOUND");
  });

  it("site connu : rendu tel quel", async () => {
    expect(await siteGate("club", "/")).toEqual({
      kind: "ORGANIZATION",
      id: "o1",
    });
  });

  it("site inconnu : introuvable", async () => {
    site.value = null;
    await expect(siteGate("club", "/")).rejects.toThrow("NOT_FOUND");
  });

  it("ancienne adresse : redirection définitive, l'accueil vers la page racine du nouveau site", async () => {
    site.value = {
      kind: "REDIRECT",
      base: "https://neuf.evoly.me",
      rootPath: "/gala",
    };
    await expect(siteGate("club", "/")).rejects.toThrow(
      "REDIRECT https://neuf.evoly.me/gala",
    );
    site.value = {
      kind: "REDIRECT",
      base: "https://neuf.evoly.me",
      rootPath: "",
    };
    await expect(siteGate("club", "/")).rejects.toThrow(
      "REDIRECT https://neuf.evoly.me/",
    );
  });

  it("ancienne adresse d'une sous-page : redirigée vers la même sous-page", async () => {
    site.value = {
      kind: "REDIRECT",
      base: "https://neuf.evoly.me",
      rootPath: "/gala",
    };
    await expect(siteGate("club", "/billets")).rejects.toThrow(
      "REDIRECT https://neuf.evoly.me/billets",
    );
  });
});
