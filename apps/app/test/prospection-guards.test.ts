import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { importLot, saveMailbox, sendTest, setMailboxLimit } from "@/server/prospection";

// prospection (administration) : garde-fous de l'import, des boîtes d'envoi et de l'e-mail de test, sans toucher à la file d'envoi
const rid = () => Math.random().toString(36).slice(2, 10);
/** Boîte désactivée : elle ne prend aucun e-mail de la file des autres tests. */
const inactiveBox = () =>
  db.prospectMailbox.create({
    data: {
      fromName: "Baptiste",
      address: `prospection.${rid()}@exemple.be`,
      smtpHost: "smtp.exemple.be",
      smtpPort: 465,
      username: "u",
      imapPort: 993,
      maxPerDay: 40,
      rampUp: true,
      passwordEnc: "chiffré",
      active: false,
    },
  });

describe("prospection : import d'un lot", () => {
  it("format invalide refusé ; plus de 500 adresses refusé", async () => {
    for (const bad of [null, {}, { emails: "lea@exemple.be" }])
      await expect(importLot(bad)).rejects.toEqual(expect.objectContaining({ code: "PROSPECTION_LOT_INVALID" }));
    await expect(importLot({ emails: Array.from({ length: 501 }, (_, i) => ({ email: `p${i}@exemple.be` })) })).rejects.toEqual(
      expect.objectContaining({ code: "PROSPECTION_LOT_TOO_LARGE" }),
    );
  });
});

describe("prospection : boîtes d'envoi", () => {
  it("limite par jour hors de 1 à 500 refusée ; nouvelle boîte sans mot de passe refusée", async () => {
    for (const max of [0, 501, Number.NaN])
      await expect(setMailboxLimit("boite", max, true)).rejects.toEqual(expect.objectContaining({ code: "PROSPECTION_LIMIT_INVALID" }));
    await expect(saveMailbox({ fromName: "Baptiste", address: `p.${rid()}@exemple.be`, smtpHost: "smtp.exemple.be" })).rejects.toEqual(
      expect.objectContaining({ code: "PROSPECTION_PASSWORD_REQUIRED" }),
    );
  });
});

describe("prospection : e-mail de test", () => {
  it("adresse invalide signalée ; envoyé à la boîte elle-même par défaut, avec sa copie", async () => {
    const box = await inactiveBox();
    const send = vi.fn(async () => undefined);
    const copy = vi.fn(async () => undefined);
    expect(await sendTest(box.id, "pas-une-adresse", send, copy)).toEqual({ ok: false, error: "adresse de test invalide" });
    expect(send).not.toHaveBeenCalled();
    expect(await sendTest(box.id, undefined, send, copy)).toEqual({ ok: true, copied: true });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: box.address, subject: "Test d'envoi de la prospection Evoly" }), expect.anything());
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("envoi en échec : expliqué ; copie en échec : l'envoi reste réussi", async () => {
    const box = await inactiveBox();
    const failing = vi.fn(async () => {
      throw new Error("connexion refusée");
    });
    const sent = await sendTest(
      box.id,
      " Test@Mail-Tester.com ",
      failing,
      vi.fn(async () => undefined),
    );
    expect(sent.ok).toBe(false);
    expect(failing).toHaveBeenCalledWith(expect.objectContaining({ to: "test@mail-tester.com" }), expect.anything());
    const copied = await sendTest(
      box.id,
      undefined,
      vi.fn(async () => undefined),
      failing,
    );
    expect(copied).toMatchObject({ ok: true, copied: false });
  });
});
