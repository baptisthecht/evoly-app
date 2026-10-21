import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { AddressSearch, fillInput } from "@/components/places/AddressSearch";
import { Fr } from "./intl";

const t = (fr as unknown as Record<string, Record<string, string>>).addressSearch!;
const madeleine = {
  id: "1",
  kind: "venue",
  name: "La Madeleine",
  addressLine1: "Rue Duquesnoy 14",
  postalCode: "1000",
  city: "Bruxelles",
  country: "BE",
  detail: "Rue Duquesnoy 14, 1000 Bruxelles",
  lat: 50.84,
  lon: 4.35,
};
const zenith = {
  id: "2",
  kind: "venue",
  name: "Le Zénith",
  addressLine1: "Avenue Jean Jaurès 211",
  postalCode: "75019",
  city: "Paris",
  country: "FR",
  detail: "Avenue Jean Jaurès 211, 75019 Paris, France",
  lat: 48.89,
  lon: 2.39,
};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ places: [madeleine, zenith] })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("recherche d'adresse : clavier, aucun résultat, remplissage", () => {
  const draw = (onSelect = vi.fn()) => {
    render(
      <Fr>
        <AddressSearch id="lieu" onSelect={onSelect} />
      </Fr>,
    );
    return { box: screen.getByRole("combobox"), onSelect };
  };
  const type = async (box: HTMLElement, value: string) => {
    fireEvent.change(box, { target: { value } });
    await act(async () => void (await new Promise((r) => setTimeout(r, 350))));
  };

  it("première suggestion active d'office ; flèche bas : la deuxième ; Entrée la choisit", async () => {
    const { box, onSelect } = draw();
    await type(box, "Madeleine");
    await screen.findByRole("listbox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: zenith.id, name: "Le Zénith" }));
  });

  it("Échap ferme la liste des suggestions", async () => {
    const { box } = draw();
    await type(box, "Madeleine");
    await screen.findByRole("listbox");
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(box.getAttribute("aria-expanded")).toBe("false");
  });

  it("aucun résultat : message affiché", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ places: [] })));
    const { box } = draw();
    await type(box, "Lieu introuvable");
    expect(await screen.findByText(t.noResults!)).toBeTruthy();
  });

  it("remplissage d'un champ : valeur posée et événement de saisie émis (formulaires React)", () => {
    const input = document.createElement("input");
    const seen = vi.fn();
    input.addEventListener("input", (e) => seen((e.target as HTMLInputElement).value));
    fillInput(input, "Bruxelles");
    expect([input.value, seen.mock.calls[0]?.[0]]).toEqual(["Bruxelles", "Bruxelles"]);
    expect(() => fillInput(null, "rien")).not.toThrow();
  });
});
