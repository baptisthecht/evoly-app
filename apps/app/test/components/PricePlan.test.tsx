import {
  EUR_TERMS,
  grossForNet,
  netForGross,
  roundedPriceOptions,
} from "@evoly/core";
import { formatMoney } from "@evoly/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { PlanPicker } from "@/app/o/[orgSlug]/billing/PlanPicker";
import { PriceFields } from "@/app/o/[orgSlug]/events/[eventId]/tickets/PriceFields";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ checkoutAction: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/billing/actions", () => actions);
const all = fr as unknown as Record<string, Record<string, string>>;
const tk = all.tickets!;
const b = all.billing!;
const terms = EUR_TERMS.free;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const input = (minor: number) => {
  const s = (minor / 100).toFixed(2);
  return (s.endsWith(".00") ? s.slice(0, -3) : s).replace(".", ",");
};
beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});

/** Le formulaire parent garde le prix, comme l'éditeur d'un tarif. */
function Harness({
  initial = "",
  locked = false,
}: {
  initial?: string;
  locked?: boolean;
}) {
  const [price, setPrice] = useState(initial);
  return (
    <form aria-label="tarif">
      <PriceFields
        id="prix"
        name="price"
        label="Prix payé"
        price={price}
        onPrice={setPrice}
        terms={terms}
        locked={locked}
      />
    </form>
  );
}
const draw = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <Fr>
      <Harness {...props} />
    </Fr>,
  );
const net = () => document.getElementById("prix-net") as HTMLInputElement;
const gross = () => document.getElementById("prix") as HTMLInputElement;

describe("prix d'un tarif : ce que touche l'organisateur et ce que paie le participant", () => {
  it("prix saisi : le montant touché est calculé par la règle de commission", () => {
    draw({ initial: "25" });
    expect(net().value).toBe(input(netForGross(2_500, terms)));
  });

  it("montant à toucher saisi : le prix payé est recalculé, plafond de commission compris", () => {
    draw();
    fireEvent.change(net(), { target: { value: "20" } });
    expect(gross().value).toBe(input(grossForNet(2_000, terms)));
    expect(net().value).toBe("20"); // la saisie de l'organisateur reste telle quelle
  });

  it("prix arrondi proposé : choisi d'un clic", () => {
    draw({ initial: "21,37" });
    const options = roundedPriceOptions(2_137);
    expect(options.length).toBeGreaterThan(0);
    const first = formatMoney(options[0]!, "EUR", "fr", {
      trimZeroCents: true,
    });
    fireEvent.click(
      screen
        .getAllByRole("button")
        .find((x) => norm(x.textContent!).includes(norm(first)))!,
    );
    expect(gross().value).toBe(input(options[0]!));
  });

  it("seul le prix payé porte un nom : c'est lui qui part au serveur", () => {
    draw({ initial: "25" });
    const data = new FormData(
      screen.getByRole("form", { name: "tarif" }) as HTMLFormElement,
    );
    expect([...data.keys()]).toEqual(["price"]);
    expect(data.get("price")).toBe("25");
  });

  it("prix verrouillé : rien n'est modifiable, aucun arrondi proposé", () => {
    draw({ initial: "21,37", locked: true });
    expect([net().readOnly, gross().readOnly]).toEqual([true, true]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("passage à l'offre Pro (RG-SUB-02)", () => {
  const prices = { MONTH: 2_900, YEAR: 29_000 };
  const sent = () => actions.checkoutAction.mock.calls[0]!.at(-1) as FormData;
  const choose = (interval: "MONTH" | "YEAR") =>
    fireEvent.click(
      screen
        .getAllByRole("radio")
        .find((r) => (r as HTMLInputElement).value === interval)!,
    );
  // le bouton cliqué part avec le formulaire (name et value), comme dans un envoi natif
  const click = async (name: string) =>
    act(async () => void fireEvent.click(screen.getByRole("button", { name })));

  it("année proposée par défaut, avec son économie", () => {
    const { container } = render(
      <Fr>
        <PlanPicker
          orgSlug="club"
          prices={prices}
          currency="EUR"
          trial={false}
        />
      </Fr>,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.find((r) => r.checked)!.value).toBe("YEAR");
    const saving = Math.round(
      ((prices.MONTH * 12 - prices.YEAR) * 100) / (prices.MONTH * 12),
    );
    expect(container.textContent).toContain(String(saving));
  });

  it("essai gratuit ou souscription : libellé et conditions adaptés", () => {
    const a = render(
      <Fr>
        <PlanPicker orgSlug="club" prices={prices} currency="EUR" trial />
      </Fr>,
    );
    expect(screen.getByRole("button", { name: b.startTrial })).toBeTruthy();
    expect(screen.getByText(b.trialTermsNoCard!)).toBeTruthy(); // essai sans carte
    a.unmount();
    render(
      <Fr>
        <PlanPicker
          orgSlug="club"
          prices={prices}
          currency="EUR"
          trial={false}
        />
      </Fr>,
    );
    expect(screen.getByRole("button", { name: b.upgrade })).toBeTruthy();
    expect(screen.getByText(b.subscribeTerms!)).toBeTruthy();
    expect(screen.queryByRole("button", { name: b.startTrial })).toBeNull();
  });

  it("essai de 14 jours sans carte : le choix de l'essai part avec la période choisie", async () => {
    render(
      <Fr>
        <PlanPicker orgSlug="club" prices={prices} currency="EUR" trial />
      </Fr>,
    );
    choose("MONTH");
    await click(b.startTrial!);
    await waitFor(() => expect(actions.checkoutAction).toHaveBeenCalled());
    expect([sent().get("mode"), sent().get("interval")]).toEqual([
      "trial",
      "MONTH",
    ]);
  });

  it("la période choisie part vers le paiement", async () => {
    render(
      <Fr>
        <PlanPicker
          orgSlug="club"
          prices={prices}
          currency="EUR"
          trial={false}
        />
      </Fr>,
    );
    choose("MONTH");
    await click(b.upgrade!);
    await waitFor(() => expect(actions.checkoutAction).toHaveBeenCalled());
    expect([sent().get("mode"), sent().get("interval")]).toEqual([
      "pay",
      "MONTH",
    ]);
  });

  it("essai sans carte, ou abonnement tout de suite ; le bouton choisi part avec la période, un refus est affiché (docs/MOLLIE.md, lot 6)", async () => {
    actions.checkoutAction.mockResolvedValue({
      ok: false,
      error: "MOLLIE_UNAVAILABLE",
    });
    render(
      <Fr>
        <PlanPicker orgSlug="club" prices={prices} currency="EUR" trial />
      </Fr>,
    );
    expect(screen.getByText(b.trialTermsNoCard!)).toBeTruthy();
    expect(screen.getByText(b.subscribeTerms!)).toBeTruthy();
    await click(b.subscribeNow!);
    await waitFor(() => expect(actions.checkoutAction).toHaveBeenCalled());
    expect([sent().get("mode"), sent().get("interval")]).toEqual([
      "pay",
      "YEAR",
    ]);
    expect((await screen.findByRole("alert")).textContent).toBe(
      all.formErrors!.MOLLIE_UNAVAILABLE,
    );
  });

  it("pendant une période en cours : un seul bouton, rien à payer avant le premier prélèvement, vérification remboursée", () => {
    const { container } = render(
      <Fr>
        <PlanPicker
          orgSlug="club"
          prices={prices}
          currency="EUR"
          trial={false}
          startsOn="2 décembre 2026"
          cta={b.subscribe}
        />
      </Fr>,
    );
    expect(screen.queryByRole("button", { name: b.startTrial })).toBeNull();
    expect(screen.getByRole("button", { name: b.subscribe })).toBeTruthy();
    const text = norm(container.textContent ?? "");
    expect(text).toContain("Rien à payer avant le 2 décembre 2026");
    expect(text).toContain(
      "paiement de vérification de 0,02 €, remboursé aussitôt",
    );
    expect(text).not.toContain(norm(b.subscribeTerms!));
  });
});
