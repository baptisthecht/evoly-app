import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  OrganizationSettingsForm,
  type SettingsValues,
} from "@/app/o/[orgSlug]/settings/SettingsClient";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  saveSettingsAction: vi.fn(),
  deleteOrganizationAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/settings/actions", () => actions);
const t = (fr as unknown as Record<string, Record<string, string>>)
  .orgSettings!;
const values: SettingsValues = {
  name: "Club",
  legalName: "Club ASBL",
  type: "ASSOCIATION",
  description: "",
  contactEmail: "info@club.be",
  phone: "",
  website: "",
  country: "BE",
  currency: "EUR",
  locale: "fr",
  timezone: "Europe/Brussels",
  addressLine1: "Rue Haute 1",
  addressLine2: "",
  postalCode: "1000",
  city: "Bruxelles",
  vatNumber: "",
  vatRegistered: false,
};
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
const draw = (over: { currencyLocked?: boolean; readOnly?: boolean } = {}) =>
  render(
    <Fr>
      <OrganizationSettingsForm
        orgSlug="club"
        values={values}
        countries={[
          { code: "BE", name: "Belgique" },
          { code: "CH", name: "Suisse" },
        ]}
        currencies={["EUR", "CHF"]}
        currencyLocked={over.currencyLocked ?? false}
        readOnly={over.readOnly ?? false}
      />
    </Fr>,
  );
const send = async () => {
  await act(
    async () =>
      void fireEvent.submit(
        screen.getByRole("button", { name: t.save }).closest("form")!,
      ),
  );
  await waitFor(() => expect(actions.saveSettingsAction).toHaveBeenCalled());
  return actions.saveSettingsAction.mock.calls.at(-1)!.at(-1) as FormData;
};

describe("paramètres de l'organisation : la devise", () => {
  it("devise verrouillée après les premières ventes : liste désactivée, devise envoyée une seule fois par le champ caché", async () => {
    draw({ currencyLocked: true });
    expect(
      (document.getElementById("org-currency") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(screen.getByText(t.currencyLocked!)).toBeTruthy();
    expect((await send()).getAll("currency")).toEqual(["EUR"]); // sans cela, l'enregistrement serait refusé faute de devise
  });

  it("devise libre : envoyée une seule fois, par la liste, sans champ caché", async () => {
    draw();
    fireEvent.change(document.getElementById("org-currency")!, {
      target: { value: "CHF" },
    });
    expect((await send()).getAll("currency")).toEqual(["CHF"]);
  });
});

describe("paramètres de l'organisation : enregistrement et lecture seule", () => {
  it("lecture seule : tous les groupes de champs désactivés, pas de bouton d'enregistrement", () => {
    const { container } = draw({ readOnly: true });
    const groups = [...container.querySelectorAll("fieldset")];
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: t.save })).toBeNull();
  });

  it("enregistré : confirmé ; erreur d'un champ affichée sous ce champ", async () => {
    draw();
    await send();
    expect(await screen.findByText(t.saved!)).toBeTruthy();
    actions.saveSettingsAction.mockResolvedValue({
      ok: false,
      error: "INVALID_INPUT",
      fields: { name: "validation.required" },
    });
    await send();
    const v = fr.validation as Record<string, string>;
    expect(await screen.findByText(v.required ?? v.invalid!)).toBeTruthy();
    expect(document.getElementById("org-name-error")!.textContent).toBe(
      v.required ?? v.invalid,
    ); // sous le champ du nom
    expect(
      document.getElementById("org-name")!.getAttribute("aria-invalid"),
    ).toBe("true"); // désormais marqué par le composant de champ
  });
});
