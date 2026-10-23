import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgContext } from "@/server/context";

const stored = vi.hoisted(() => ({
  files: [] as Array<{ key: string; type: string; bytes: Uint8Array }>,
}));
vi.mock("@/server/storage", () => ({
  putPublicFile: async (key: string, bytes: Uint8Array, type: string) => (
    stored.files.push({ key, type, bytes }),
    `https://cdn.test/${key}`
  ),
  deletePublicFile: async () => undefined,
}));
const { db } = await import("@/lib/db");
const { uploadImage } = await import("@/server/brand");

const rid = () => Math.random().toString(36).slice(2, 10);
const ctxOf = (id: string) =>
  ({ organization: { id }, user: { id: "u1" } }) as unknown as OrgContext;
const image = (format: "png" | "jpeg" | "webp", width = 4, height = 4) =>
  sharp({ create: { width, height, channels: 3, background: "#1B4D8C" } })
    [format]()
    .toBuffer()
    .then((b) => new Uint8Array(b));
const svg = (body: string) =>
  new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${body}</svg>`,
  );
async function orgWithEvent() {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: "Club",
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 86_400_000),
    },
  });
  return { org, event, ctx: ctxOf(org.id) };
}
beforeEach(() => {
  stored.files = [];
});

describe("envoi d'images de la marque (RG-FILE-01)", () => {
  it("vide ou au-delà de la limite de son type : refusé avant toute lecture", async () => {
    const ctx = ctxOf("o1");
    await expect(
      uploadImage(ctx, "logo", new Uint8Array(0)),
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    await expect(
      uploadImage(ctx, "favicon", new Uint8Array(500_001)),
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    await expect(
      uploadImage(ctx, "logo", new Uint8Array(2_000_001)),
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    expect(stored.files).toEqual([]);
  });

  it("type réel lu dans le contenu : un texte déguisé en image est refusé", async () => {
    await expect(
      uploadImage(
        ctxOf("o1"),
        "logo",
        new TextEncoder().encode("<html><script>alert(1)</script></html>"),
      ),
    ).rejects.toMatchObject({
      code: "UPLOAD_TYPE",
    });
    expect(stored.files).toEqual([]);
  });

  it("PNG, JPEG et WebP : rangés sous une clé aléatoire de l'organisation, avec la bonne extension", async () => {
    const ctx = ctxOf("o1");
    for (const [format, ext, type] of [
      ["png", "png", "image/png"],
      ["jpeg", "jpg", "image/jpeg"],
      ["webp", "webp", "image/webp"],
    ] as const) {
      const url = await uploadImage(ctx, "logo", await image(format));
      const f = stored.files.at(-1)!;
      expect(f.key).toMatch(new RegExp(`^orgs/o1/logo-[a-z0-9]+\\.${ext}$`));
      expect(f.type).toBe(type);
      expect(url).toBe(`https://cdn.test/${f.key}`);
    }
    expect(new Set(stored.files.map((f) => f.key)).size).toBe(3); // une clé neuve à chaque fois
  });

  it("SVG avec script ou gestionnaire d'événement : refusé ; SVG sûr : converti en PNG, jamais gardé tel quel", async () => {
    const ctx = ctxOf("o1");
    await expect(
      uploadImage(ctx, "logo", svg("<script>alert(1)</script>")),
    ).rejects.toMatchObject({ code: "UPLOAD_SVG_UNSAFE" });
    await expect(
      uploadImage(
        ctx,
        "logo",
        new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
        ),
      ),
    ).rejects.toMatchObject({
      code: "UPLOAD_SVG_UNSAFE",
    });
    expect(stored.files).toEqual([]);
    await uploadImage(
      ctx,
      "favicon",
      svg('<rect width="10" height="10" fill="#f00"/>'),
    );
    const f = stored.files.at(-1)!;
    expect([f.type, f.key.endsWith(".png")]).toEqual(["image/png", true]);
    expect((await sharp(Buffer.from(f.bytes)).metadata()).format).toBe("png");
    expect(new TextDecoder().decode(f.bytes)).not.toContain("<svg");
  });

  it("couverture : seulement pour un événement de l'organisation", async () => {
    const mine = await orgWithEvent();
    const other = await orgWithEvent();
    await expect(
      uploadImage(mine.ctx, "cover", await image("png"), other.event.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      uploadImage(mine.ctx, "cover", await image("png"), null),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await uploadImage(mine.ctx, "cover", await image("png"), mine.event.id);
    expect(stored.files.at(-1)!.key).toMatch(
      new RegExp(`^events/${mine.event.id}/cover-[a-z0-9]+\\.png$`),
    );
  });

  it("vue depuis la place : réduite à 1 600 px de large et réencodée en JPEG, pour un événement de l'organisation", async () => {
    const mine = await orgWithEvent();
    await expect(
      uploadImage(
        mine.ctx,
        "seatview",
        await image("png"),
        "evenement-inconnu",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await uploadImage(
      mine.ctx,
      "seatview",
      await image("png", 3000, 100),
      mine.event.id,
    );
    const f = stored.files.at(-1)!;
    expect(f.key).toMatch(
      new RegExp(`^events/${mine.event.id}/view-[a-z0-9]+\\.jpg$`),
    );
    const meta = await sharp(Buffer.from(f.bytes)).metadata();
    expect([meta.format, meta.width]).toEqual(["jpeg", 1600]);
  });

  it("image corrompue envoyée comme vue depuis la place : refusée", async () => {
    const mine = await orgWithEvent();
    const broken = (await image("png")).slice(0, 40); // en-tête PNG, contenu tronqué
    await expect(
      uploadImage(mine.ctx, "seatview", broken, mine.event.id),
    ).rejects.toMatchObject({ code: "UPLOAD_TYPE" });
  });
});
