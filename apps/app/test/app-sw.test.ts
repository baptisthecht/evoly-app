import { describe, expect, it } from "vitest";
import { GET } from "@/app/app-sw.js/route";

// Exécute le service worker réellement servi à /app-sw.js dans un faux environnement, avec un réseau simulé.
async function load(language: string, network: (url: string) => Promise<Response>) {
  const js = await GET().text();
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    navigator: { language },
    location: { origin: "https://app.evoly.me" },
    addEventListener: (t: string, f: (e: unknown) => void) => {
      handlers[t] = f;
    },
    skipWaiting() {},
    clients: { claim: async () => {} },
  };
  new Function("self", "fetch", "Response", js)(self, (r: { url: string }) => network(r.url), Response);
  return {
    js,
    navigate: async (url: string, mode = "navigate", method = "GET") => {
      let responded: Promise<Response> | undefined;
      handlers.fetch!({
        request: { mode, method, url },
        respondWith: (p: Promise<Response>) => {
          responded = p;
        },
      });
      return responded;
    },
  };
}
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

describe("service worker de l'app installable", () => {
  it("sans réseau : page « hors ligne » dans la langue de l'appareil (anglais par défaut)", async () => {
    for (const [lang, title, retry] of [
      ["fr-BE", "Vous êtes hors ligne", "Réessayer"],
      ["de-DE", "Sie sind offline", "Erneut versuchen"],
      ["ja-JP", "You're offline", "Try again"],
    ] as const) {
      const sw = await load(lang, offline);
      const res = (await sw.navigate("https://app.evoly.me/o/asso/events"))!;
      expect(res.status, lang).toBe(503);
      const html = await res.text();
      expect(html, lang).toContain(title.replace("'", "'"));
      expect(html, lang).toContain(retry);
    }
  });
  it("avec réseau : la page du serveur, telle quelle", async () => {
    const sw = await load("fr-BE", async () => new Response("tableau de bord", { status: 200 }));
    expect(await (await sw.navigate("https://app.evoly.me/o/asso"))!.text()).toBe("tableau de bord");
  });
  it("ne touche ni à l'API, ni aux autres sites, ni aux requêtes autres que des pages", async () => {
    const sw = await load("fr-BE", offline);
    expect(await sw.navigate("https://app.evoly.me/api/health")).toBeUndefined();
    expect(await sw.navigate("https://checkout.stripe.com/pay")).toBeUndefined();
    expect(await sw.navigate("https://app.evoly.me/_next/static/app.js", "no-cors")).toBeUndefined();
    expect(await sw.navigate("https://app.evoly.me/o/asso", "navigate", "POST")).toBeUndefined();
  });
  it("aucun cache : aucune page ni donnée ne reste sur l'appareil", async () => {
    const { js } = await load("fr-BE", offline);
    expect(js).not.toMatch(/caches\.|indexedDB|localStorage/);
  });
});
