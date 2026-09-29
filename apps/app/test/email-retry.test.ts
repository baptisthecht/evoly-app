import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { emailTestHooks, retryFailedEmails, sendEmail } from "@/server/email/send";

const rid = () => Math.random().toString(36).slice(2, 10);
const mail = (to: string) => ({ to, template: "test.retry", category: "TRANSACTIONAL" as const, subject: "Vos billets", text: "Bonjour", html: "<p>Bonjour</p>", attachments: [{ filename: "billets.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.7 test") }] });

describe("renvoi des e-mails en échec (RG-ARC-06)", () => {
  it("contenu gardé après une panne, renvoyé par la tâche, pièce jointe comprise ; délai doublé, abandon après 5 tentatives", async () => {
    const to = `retry.${rid()}@exemple.be`;
    emailTestHooks.failNext = 1;
    await expect(sendEmail(mail(to))).rejects.toThrow("panne simulée");
    const failed = await db.emailMessage.findFirstOrThrow({ where: { toEmail: to } });
    expect(failed).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(failed.retryPayload).not.toBeNull();
    expect(await retryFailedEmails(new Date())).toMatchObject({ sent: 0 }); // pas encore l'heure
    expect(await retryFailedEmails(new Date(Date.now() + 6 * 60_000))).toMatchObject({ sent: 1 });
    const sent = await db.emailMessage.findUniqueOrThrow({ where: { id: failed.id } });
    expect(sent).toMatchObject({ status: "SENT", attempts: 2, retryPayload: null });
    expect((await readdir(process.env.EMAIL_OUTBOX_DIR!)).some((f) => f.includes(failed.id) && f.endsWith("billets.pdf"))).toBe(true);

    const to2 = `retry2.${rid()}@exemple.be`;
    emailTestHooks.failNext = 10;
    await expect(sendEmail(mail(to2))).rejects.toThrow();
    const m = await db.emailMessage.findFirstOrThrow({ where: { toEmail: to2 } });
    let at = Date.now();
    for (let i = 0; i < 4; i++) {
      at += 10 * 3_600_000;
      await retryFailedEmails(new Date(at));
    }
    const gaveUp = await db.emailMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(gaveUp).toMatchObject({ status: "FAILED", attempts: 5, retryPayload: null, nextAttemptAt: null });
    emailTestHooks.failNext = 0;
  });
});
