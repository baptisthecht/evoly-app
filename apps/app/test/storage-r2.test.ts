import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", async (original) => {
  const real = (await original()) as { env: () => Record<string, unknown> };
  return {
    env: () => ({
      ...real.env(),
      R2_ACCOUNT_ID: "compte",
      R2_ACCESS_KEY_ID: "cle",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "evoly",
      R2_PUBLIC_URL: "https://cdn.evoly.me/",
    }),
  };
});
const net = vi.hoisted(() => ({ calls: [] as Array<{ url: string; method: string; headers: Headers }>, status: 200 }));
beforeEach(() => {
  net.calls = [];
  net.status = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      net.calls.push({ url: req.url, method: req.method, headers: req.headers });
      return new Response(null, { status: net.status });
    }),
  );
});
const { publicFileUrl, putPublicFile, readLocalFile } = await import("@/server/storage");

describe("stockage des fichiers publics sur Cloudflare R2 (production)", () => {
  it("dépôt par PUT à l'adresse du compte et du bucket, type et mise en cache longue ; adresse publique rendue", async () => {
    const url = await putPublicFile("orgs/o1/logo-abc.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(url).toBe("https://cdn.evoly.me/orgs/o1/logo-abc.png");
    expect(net.calls).toHaveLength(1);
    expect([net.calls[0]!.method, net.calls[0]!.url]).toEqual(["PUT", "https://compte.r2.cloudflarestorage.com/evoly/orgs/o1/logo-abc.png"]);
    expect(net.calls[0]!.headers.get("content-type")).toBe("image/png");
    expect(net.calls[0]!.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(net.calls[0]!.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /); // requête signée
  });

  it("refus de R2 : erreur, jamais un faux succès", async () => {
    net.status = 403;
    await expect(putPublicFile("orgs/o1/logo-abc.png", new Uint8Array([1]), "image/png")).rejects.toThrow("dépôt R2 refusé (403)");
  });

  it("clé dangereuse refusée avant tout envoi (remontée de dossiers, majuscules, chemin absolu, clé vide)", async () => {
    for (const key of ["../etc/passwd", "orgs/../../secret", "Orgs/Logo.png", "/orgs/a.png", "", "orgs/a b.png"]) {
      await expect(putPublicFile(key, new Uint8Array([1]), "image/png")).rejects.toThrow("clé de fichier invalide");
    }
    expect(net.calls).toEqual([]);
  });

  it("lecture d'une clé dangereuse : rien ; adresse publique sans double barre oblique", async () => {
    expect(await readLocalFile("../etc/passwd")).toBeNull();
    expect(await readLocalFile("orgs/../../secret")).toBeNull();
    expect(publicFileUrl("orgs/o1/a.png")).toBe("https://cdn.evoly.me/orgs/o1/a.png");
  });
});
