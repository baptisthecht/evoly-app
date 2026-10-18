import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logoBytes } from "@/server/email/brand";
import { putPublicFile } from "@/server/storage";

const rid = () => Math.random().toString(36).slice(2, 10);
const image = (format: "png" | "jpeg" | "webp") =>
  sharp({ create: { width: 2, height: 2, channels: 3, background: "#123456" } })
    [format]()
    .toBuffer()
    .then((b) => new Uint8Array(b));
afterEach(() => vi.unstubAllGlobals());

describe("logo des billets PDF (PNG ou JPEG seulement)", () => {
  it("logo stocké : PNG et JPEG lus, WebP refusé (non pris en charge par les PDF standard)", async () => {
    const png = await putPublicFile(`orgs/test/logo-${rid()}.png`, await image("png"), "image/png");
    const jpg = await putPublicFile(`orgs/test/logo-${rid()}.jpg`, await image("jpeg"), "image/jpeg");
    const webp = await putPublicFile(`orgs/test/logo-${rid()}.webp`, await image("webp"), "image/webp");
    expect((await logoBytes(png))?.type).toBe("image/png");
    expect((await logoBytes(jpg))?.type).toBe("image/jpeg");
    expect(await logoBytes(webp)).toBeNull();
  });

  it("logo distant : téléchargé ; réponse en erreur ou réseau coupé : rien, sans faire planter le PDF", async () => {
    const png = await image("png");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(png, { status: 200 })),
    );
    expect((await logoBytes("https://ailleurs.example/logo.png"))?.type).toBe("image/png");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("introuvable", { status: 404 })),
    );
    expect(await logoBytes("https://ailleurs.example/logo.png")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("réseau coupé"))),
    );
    expect(await logoBytes("https://ailleurs.example/logo.png")).toBeNull();
  });

  it("sans logo : rien", async () => {
    expect(await logoBytes(null)).toBeNull();
  });

  it("fichier local disparu : relu à son adresse publique, sinon rien", async () => {
    const gone = await putPublicFile(`orgs/test/logo-${rid()}.png`, await image("png"), "image/png");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("introuvable", { status: 404 })),
    );
    const missing = gone.replace(/logo-[a-z0-9]+\.png$/, `logo-absent-${rid()}.png`);
    expect(await logoBytes(missing)).toBeNull();
  });
});
