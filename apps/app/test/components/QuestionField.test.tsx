import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  QuestionField,
  type PublicQuestion,
} from "@/components/public/QuestionField";

const q = (
  type: PublicQuestion["type"],
  over: Partial<PublicQuestion> = {},
): PublicQuestion => ({
  id: "q1",
  label: "Votre question",
  helpText: null,
  type,
  required: false,
  options: null,
  ...over,
});
const draw = (
  question: PublicQuestion,
  value: unknown = null,
  error?: string,
) => {
  const onChange = vi.fn();
  render(
    <QuestionField
      q={question}
      id="champ"
      value={value}
      onChange={onChange}
      error={error}
    />,
  );
  return onChange;
};

describe("questions posées à l'acheteur (US-QST-01)", () => {
  it("case à cocher : libellé, astérisque si obligatoire, réponse oui ou non", () => {
    const onChange = draw(
      q("CHECKBOX", { label: "J'accepte le règlement", required: true }),
      true,
    );
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.getByText("*")).toBeTruthy();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("choix multiple : cocher ajoute, décocher retire ; une réponse invalide vaut une liste vide", () => {
    const onChange = draw(
      q("MULTI_SELECT", { options: ["Végétarien", "Sans gluten", "Halal"] }),
      ["Végétarien"],
    );
    const [veg, gluten] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect([veg!.checked, gluten!.checked]).toEqual([true, false]);
    fireEvent.click(gluten!);
    expect(onChange).toHaveBeenLastCalledWith(["Végétarien", "Sans gluten"]);
    fireEvent.click(veg!);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("choix multiple sans réponse valable : rien de coché, rien qui plante", () => {
    draw(q("MULTI_SELECT", { options: ["A", "B"] }), "pas une liste");
    expect(
      (screen.getAllByRole("checkbox") as HTMLInputElement[]).every(
        (b) => !b.checked,
      ),
    ).toBe(true);
  });

  it("liste déroulante : un choix vide puis les options ; la réponse choisie est transmise", () => {
    const onChange = draw(q("SELECT", { options: ["S", "M", "L"] }), 42);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect([...select.options].map((o) => o.value)).toEqual([
      "",
      "S",
      "M",
      "L",
    ]);
    fireEvent.change(select, { target: { value: "M" } });
    expect(onChange).toHaveBeenCalledWith("M");
  });

  it("texte long : limité à 2 000 caractères", () => {
    const onChange = draw(q("TEXTAREA"), "Bonjour");
    const area = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect([area.value, area.maxLength]).toEqual(["Bonjour", 2000]);
    fireEvent.change(area, { target: { value: "Merci" } });
    expect(onChange).toHaveBeenCalledWith("Merci");
  });

  it("champs simples : le bon type et le bon clavier sur téléphone", () => {
    const cases: Array<[PublicQuestion["type"], string, string | null]> = [
      ["NUMBER", "text", "decimal"],
      ["DATE", "date", null],
      ["PHONE", "tel", "tel"],
      ["EMAIL", "email", "email"],
      ["TEXT", "text", null],
    ];
    for (const [type, inputType, mode] of cases) {
      const { unmount, container } = render(
        <QuestionField
          q={q(type)}
          id={`c-${type}`}
          value=""
          onChange={() => undefined}
        />,
      );
      const input = container.querySelector("input")!;
      expect([type, input.type, input.getAttribute("inputmode")]).toEqual([
        type,
        inputType,
        mode,
      ]);
      unmount();
    }
  });

  it("réponse non textuelle : affichée telle quelle, vide si absente", () => {
    const { unmount } = render(
      <QuestionField
        q={q("NUMBER")}
        id="n"
        value={12}
        onChange={() => undefined}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("12");
    unmount();
    draw(q("TEXT"), null);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });

  it("aide et erreur : l'erreur est annoncée et le champ signalé", () => {
    draw(
      q("TEXT", { helpText: "Tel qu'il figure sur la pièce d'identité" }),
      "",
      "Obligatoire.",
    );
    expect(
      screen.getByText("Tel qu'il figure sur la pièce d'identité"),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Obligatoire.");
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });
});
