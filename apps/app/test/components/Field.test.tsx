import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, Input, Select } from "@/components/ui/Field";

describe("champ de formulaire accessible (WCAG 3.3.1, 1.3.1)", () => {
  it("en erreur : le champ est marqué invalide et relié à son message", () => {
    render(
      <Field label="Nom" htmlFor="nom" error="Obligatoire.">
        <Input id="nom" />
      </Field>,
    );
    const input = screen.getByLabelText("Nom");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("nom-error");
    expect(document.getElementById("nom-error")!.textContent).toBe("Obligatoire.");
  });

  it("avec une aide : relié à l'aide, sans être marqué invalide", () => {
    render(
      <Field label="Jauge" htmlFor="jauge" hint="Laisser vide pour illimité">
        <Input id="jauge" />
      </Field>,
    );
    const input = screen.getByLabelText("Jauge");
    expect([input.getAttribute("aria-invalid"), input.getAttribute("aria-describedby")]).toEqual([null, "jauge-hint"]);
  });

  it("un lien déjà présent est conservé ; une précision de l'écran est respectée", () => {
    render(
      <>
        <Field label="Code" htmlFor="code" error="Invalide.">
          <Input id="code" aria-describedby="code-exemple" />
        </Field>
        <Field label="Pays" htmlFor="pays" error="À vérifier.">
          <Select id="pays" aria-invalid={false}>
            <option>BE</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Code").getAttribute("aria-describedby")).toBe("code-exemple code-error");
    expect(screen.getByLabelText("Pays").getAttribute("aria-invalid")).toBe("false");
  });

  it("sans erreur ni aide : rien n'est ajouté", () => {
    render(
      <Field label="Ville" htmlFor="ville">
        <Input id="ville" />
      </Field>,
    );
    const input = screen.getByLabelText("Ville");
    expect([input.getAttribute("aria-invalid"), input.getAttribute("aria-describedby")]).toEqual([null, null]);
  });

  it("plusieurs éléments : laissés tels quels", () => {
    render(
      <Field label="Prix" htmlFor="prix" error="Trop bas.">
        <Input id="prix" />
        <span>€</span>
      </Field>,
    );
    expect(screen.getByLabelText("Prix").getAttribute("aria-describedby")).toBeNull();
  });
});
