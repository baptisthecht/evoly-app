import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { AddressSearch } from "@/components/places/AddressSearch";
import { Fr } from "./intl";

const t = (fr as unknown as Record<string, Record<string, string>>)
  .addressSearch!;
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
  fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ places: [madeleine, zenith] })),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("recherche d'adresse (liste de suggestions accessible)", () => {
  it("pas de recherche avant 3 caractères ; ensuite, suggestions et mention OpenStreetMap", async () => {
    render(
      <Fr>
        <AddressSearch id="lieu" onSelect={() => {}} />
      </Fr>,
    );
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "La" } });
    await new Promise((r) => setTimeout(r, 300));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "La Mad" } });
    expect(
      await screen.findByRole("option", { name: /La Madeleine/ }),
    ).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/api/places?q=La+Mad&lang=fr",
    );
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(t.attribution!)).toBeTruthy();
  });

  it("clavier : flèche puis Entrée choisit, sans envoyer le formulaire ; le champ prévient l'enregistrement automatique", async () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onInput = vi.fn();
    render(
      <Fr>
        <form onSubmit={onSubmit} onInput={onInput}>
          <AddressSearch id="lieu" onSelect={onSelect} />
        </form>
      </Fr>,
    );
    const box = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "salle" } });
    await screen.findByRole("option", { name: /Le Zénith/ });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).toBe("lieu-option-1");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(zenith);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box.value).toBe("Le Zénith");
    expect(onInput).toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("aucun résultat : invitation à saisir le lieu à la main ; Échap ferme la liste", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ places: [] })),
    );
    render(
      <Fr>
        <AddressSearch id="lieu" onSelect={() => {}} />
      </Fr>,
    );
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "Introuvable" } });
    expect(await screen.findByText(t.noResults!)).toBeTruthy();
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() =>
      expect(box.getAttribute("aria-expanded")).toBe("false"),
    );
  });

  it("panne du service : aucune suggestion, la saisie libre reste possible", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("réseau");
    });
    render(
      <Fr>
        <AddressSearch id="lieu" onSelect={() => {}} />
      </Fr>,
    );
    const box = screen.getByRole("combobox") as HTMLInputElement;
    await act(
      async () => void fireEvent.change(box, { target: { value: "Ma salle" } }),
    );
    expect(await screen.findByText(t.noResults!)).toBeTruthy();
    expect(box.value).toBe("Ma salle");
  });
});
