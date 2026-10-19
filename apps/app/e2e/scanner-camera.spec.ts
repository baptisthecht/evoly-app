import { chromium, expect, test } from "./fixtures";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";
import { buyFree, organizer, publishedFreeEvent, siteUrl, sql } from "./helpers";

/** Vidéo factice pour la caméra (y4m) : 3 secondes vides, puis le QR code du billet pendant 1 seconde ; Chromium la rejoue en boucle. */
function fakeCamera(text: string) {
  const W = 320;
  const H = 240;
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const cell = Math.floor(200 / (size + 8));
  const ox = Math.floor((W - cell * (size + 8)) / 2);
  const oy = Math.floor((H - cell * (size + 8)) / 2);
  const blank = Buffer.alloc(W * H, 235);
  const frame = Buffer.alloc(W * H, 235);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (qr.modules.get(y, x))
        for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) frame[(oy + (y + 4) * cell + dy) * W + ox + (x + 4) * cell + dx] = 16;
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 40; i++) parts.push(Buffer.from("FRAME\n"), i < 30 ? blank : frame, chroma);
  const file = join(mkdtempSync(join(tmpdir(), "evoly-camera-")), "camera.y4m");
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

test("caméra : le mode choisi après l'allumage est respecté (vérification seule : billet contrôlé, entrée non validée)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "un seul navigateur à caméra simulée suffit");
  const { id, slug } = await organizer(page);
  const eventUrl = await publishedFreeEvent(page, slug, `Soirée ${id}`, 10);
  await buyFree(page, siteUrl(slug, `/soiree-${id}`), "Fosse", 1, `cam.${id}@exemple.be`);
  const code = sql(`select t.code from "Ticket" t join "Event" e on e.id = t."eventId" where e.slug = 'soiree-${id}'`);
  await page.goto(`${eventUrl}/entries`);
  await page.getByRole("button", { name: "+ Nouveau lien bénévole" }).click();
  await page.getByLabel("Libellé").fill("Porte caméra");
  await page.getByRole("button", { name: "Créer le lien" }).click();
  await expect(page.getByText("Porte caméra")).toBeVisible();
  const url = (await page.getByTestId("scanner-url").textContent())!;

  // un navigateur dont la caméra filme une vidéo factice montrant le QR code du billet
  const camera = await chromium.launch({
    executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    args: [
      "--host-resolver-rules=MAP *.test 127.0.0.1",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${fakeCamera(code)}`,
    ],
  });
  try {
    const volunteer = await (await camera.newContext({ locale: "fr-BE", permissions: ["camera"] })).newPage();
    await volunteer.goto(url);
    await volunteer.getByRole("button", { name: "Activer la caméra" }).click();
    await volunteer.getByRole("button", { name: "Vérification" }).click(); // après l'allumage : c'est ce mode qui doit compter
    await expect(volunteer.getByText("Billet valable")).toBeVisible({ timeout: 15_000 });
    expect(sql(`select status from "Ticket" where code = '${code}'`)).toBe("VALID"); // contrôlé, mais pas validé à l'entrée
  } finally {
    await camera.close();
  }
});
