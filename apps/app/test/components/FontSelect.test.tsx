import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FontSelect } from "@/components/ui/FontSelect";

// choix d'une police : chaque police s'affiche dans sa propre typographie ; clic, clavier, valeur envoyée avec le formulaire
const options = [
  { value: "", label: "Par défaut", family: "Poppins, system-ui, sans-serif" },
  { value: "space-grotesk", label: "Space Grotesk", family: '"Space Grotesk", system-ui, sans-serif' },
  { value: "lora", label: "Lora", family: "Lora, Georgia, serif" },
];
function Harness() {
  const [value, setValue] = useState("");
  return (
    <form data-testid="form">
      <FontSelect id="bodyFont" name="bodyFont" value={value} options={options} onChange={setValue} />
    </form>
  );
}
// valeur envoyée avec le formulaire : le champ caché nommé (le bouton porte le même identifiant, pour son libellé)
const hidden = () => screen.getByTestId("form").querySelector<HTMLInputElement>('input[type="hidden"][name="bodyFont"]')!;

describe("choix d'une police", () => {
  it("chaque option est affichée dans sa police ; le bouton aussi", () => {
    render(<Harness />);
    const combo = screen.getByRole("combobox");
    expect(combo.style.fontFamily).toContain("Poppins");
    fireEvent.click(combo);
    const shown = screen.getAllByRole("option").map((o) => [o.textContent, o.style.fontFamily]);
    expect(shown).toEqual(options.map((o) => [o.label, o.family]));
  });

  it("clic sur une police : choisie, envoyée avec le formulaire, affichée dans sa police ; liste refermée", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Lora" }));
    expect(hidden().value).toBe("lora");
    expect(screen.getByRole("combobox").style.fontFamily).toContain("Lora");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clavier : flèche bas pour ouvrir, flèche bas pour avancer, Entrée pour choisir ; Échap referme sans changer", () => {
    render(<Harness />);
    const combo = screen.getByRole("combobox");
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(hidden().value).toBe("space-grotesk");
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "End" });
    fireEvent.keyDown(combo, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(hidden().value).toBe("space-grotesk");
  });
});
