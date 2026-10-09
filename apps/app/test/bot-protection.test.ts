import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BOT_DIFFICULTY, createChallenge, leadingZeroBits, verifyProof, type BotChallenge } from "@/server/botProtection";

const solve = (c: BotChallenge) => {
  for (let nonce = 0; ; nonce++) if (leadingZeroBits(createHash("sha256").update(`${c.salt}${nonce}`).digest()) >= c.difficulty) return { ...c, nonce };
};

describe("protection anti-robots (RG-BUY-10)", () => {
  it("compte les bits nuls en tête d'une empreinte", () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0x0f]))).toBe(20);
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0x01, 0xff]))).toBe(7);
  });

  it("preuve juste acceptée une seule fois ; mauvaise réponse, autre événement, défi expiré ou affaibli refusés", async () => {
    const proof = solve(createChallenge("evt-a"));
    expect(await verifyProof("evt-b", proof)).toBe(false); // signé pour un autre événement
    expect(await verifyProof("evt-a", { ...proof, nonce: proof.nonce + 1 })).toBe(false);
    expect(await verifyProof("evt-a", proof)).toBe(true);
    expect(await verifyProof("evt-a", proof)).toBe(false); // déjà utilisée
    const expired = solve(createChallenge("evt-a", Date.now() - 11 * 60_000));
    expect(await verifyProof("evt-a", expired)).toBe(false);
    const weak = solve(createChallenge("evt-a", Date.now(), BOT_DIFFICULTY - 6));
    expect(await verifyProof("evt-a", weak)).toBe(false); // difficulté abaissée
    expect(await verifyProof("evt-a", null)).toBe(false);
  });
});
