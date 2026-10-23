import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("mots de passe (RG-AUTH-02)", () => {
  it("haché en Argon2id, jamais en clair", async () => {
    const hash = await hashPassword("un mot de passe solide");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("un mot de passe solide");
  });

  it("le bon mot de passe est accepté, un autre refusé", async () => {
    const hash = await hashPassword("un mot de passe solide");
    expect(
      await verifyPassword({ hash, password: "un mot de passe solide" }),
    ).toBe(true);
    expect(
      await verifyPassword({ hash, password: "un mot de passe faux" }),
    ).toBe(false);
  });

  it("une empreinte abîmée est refusée, sans faire planter le serveur", async () => {
    expect(
      await verifyPassword({ hash: "pas-une-empreinte", password: "x" }),
    ).toBe(false);
  });
});
