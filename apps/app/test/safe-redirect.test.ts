import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safeRedirect";

describe("adresse de retour (sécurité : pas de redirection vers un site tiers)", () => {
  it("chemins internes acceptés, adresses externes et contournements refusés", () => {
    expect(safeNext("/acces-scanner")).toBe("/acces-scanner");
    expect(safeNext("/o/club?onglet=commandes#haut")).toBe("/o/club?onglet=commandes#haut");
    for (const bad of [
      "https://pirate.example",
      "//pirate.example",
      "/\\pirate.example",
      "/\\/pirate.example",
      "\\\\pirate.example",
      "javascript:alert(1)",
      "/ok\npirate",
      "",
      null,
      42,
    ])
      expect(safeNext(bad)).toBeNull();
  });
});
