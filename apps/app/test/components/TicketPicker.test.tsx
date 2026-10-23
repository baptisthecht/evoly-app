import { unitDiscount } from "@evoly/core";
import { formatMoney } from "@evoly/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  TicketPicker,
  type PickerTicket,
} from "@/components/public/TicketPicker";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  botChallengeAction: vi.fn(),
  friendSeatsAction: vi.fn(),
  previewPromoAction: vi.fn(),
  reserveAction: vi.fn(),
  joinWaitlistAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const bot = vi.hoisted(() => ({ solveBotChallenge: vi.fn() }));
vi.mock("@/components/public/botProof", () => bot);
vi.mock("@/components/public/CheckoutPanel", () => ({
  CheckoutPanel: ({
    reservation,
    onCancel,
  }: {
    reservation: { token: string };
    onCancel: () => void;
  }) => (
    <div>
      <p>panier {reservation.token}</p>
      <button type="button" onClick={onCancel}>
        revenir
      </button>
    </div>
  ),
}));

const p = fr.public as Record<string, string>;
const c = fr.checkout as Record<string, string>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const money = (v: number) =>
  formatMoney(v, "EUR", "fr", { trimZeroCents: true });
const tk = (id: string, over: Partial<PickerTicket> = {}): PickerTicket => ({
  id,
  name: `Tarif ${id}`,
  description: null,
  priceMinor: 1_000,
  tierName: null,
  next: null,
  remaining: 50,
  quantity: 50,
  minPerOrder: 1,
  maxPerOrder: 10,
  onSale: true,
  ...over,
});
type Props = Partial<Parameters<typeof TicketPicker>[0]>;
const draw = (props: Props = {}) =>
  render(
    <Fr>
      <TicketPicker
        tickets={[tk("A")]}
        currency="EUR"
        timeZone="Europe/Brussels"
        maxPerOrder={10}
        state="OPEN"
        checkout={{
          eventId: "e1",
          organizationName: "Club",
          requirePhone: false,
          publishableKey: null,
        }}
        {...props}
      />
    </Fr>,
  );
const more = (name: string) =>
  screen.getByRole("button", { name: p.more!.replace("{name}", name) });
const less = (name: string) =>
  screen.getByRole("button", { name: p.less!.replace("{name}", name) });
const count = (name: string) =>
  more(name).parentElement!.querySelector("output")!.textContent;
const click = (el: HTMLElement, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(el);
};
const continueButton = () =>
  screen.getByRole("button", { name: p.continue }) as HTMLButtonElement;
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  bot.solveBotChallenge.mockReset();
  actions.botChallengeAction.mockResolvedValue(null);
  actions.friendSeatsAction.mockResolvedValue(null);
});
afterEach(() => window.history.pushState({}, "", "/"));

describe("choix des billets (US-PUB-02)", () => {
  it("quantités plafonnées par le stock, par le maximum du tarif et par le maximum de la commande", () => {
    draw({
      tickets: [tk("A", { maxPerOrder: 4 }), tk("B", { remaining: 2 })],
      maxPerOrder: 5,
    });
    click(more("Tarif B"), 3);
    expect(count("Tarif B")).toBe("2"); // stock restant
    click(more("Tarif A"), 4);
    expect(count("Tarif A")).toBe("3"); // la commande est limitée à 5
    click(less("Tarif A"));
    expect(count("Tarif A")).toBe("2");
  });

  it("minimum par commande : directement au minimum, puis zéro en dessous", () => {
    draw({ tickets: [tk("A", { minPerOrder: 2 })] });
    click(more("Tarif A"));
    expect(count("Tarif A")).toBe("2");
    click(less("Tarif A"));
    expect(count("Tarif A")).toBe("0");
  });

  it("réservation : lignes, options et code d'ambassadeur de l'adresse transmis ; le panier s'ouvre ; annuler vide la sélection", async () => {
    window.history.pushState({}, "", "/gala?a=AMBA-1");
    actions.reserveAction.mockResolvedValue({
      ok: true,
      data: { token: "jeton" },
    });
    draw();
    click(more("Tarif A"), 2);
    await act(async () => void fireEvent.click(continueButton()));
    expect(actions.reserveAction).toHaveBeenCalledWith(
      "e1",
      [{ ticketTypeId: "A", quantity: 2 }],
      null,
      null,
      null,
      null,
      [],
      null,
      "amba-1",
    );
    expect(await screen.findByText("panier jeton")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "revenir" }));
    expect(count("Tarif A")).toBe("0");
  });

  it("défi anti-robots : résolu dans le navigateur, la preuve transmise", async () => {
    actions.botChallengeAction.mockResolvedValue({ salt: "s", difficulty: 1 });
    bot.solveBotChallenge.mockResolvedValue("preuve");
    actions.reserveAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    draw();
    click(more("Tarif A"));
    await act(async () => void fireEvent.click(continueButton()));
    expect(bot.solveBotChallenge).toHaveBeenCalledWith({
      salt: "s",
      difficulty: 1,
    });
    expect(actions.reserveAction.mock.calls[0]![5]).toBe("preuve");
  });

  it("refus de réservation : explication traduite, sinon message générique", async () => {
    draw();
    click(more("Tarif A"));
    actions.reserveAction.mockResolvedValue({
      ok: false,
      error: "CART_EVENT_NOT_ON_SALE",
    });
    await act(async () => void fireEvent.click(continueButton()));
    expect(
      await screen.findByText(c.error_CART_EVENT_NOT_ON_SALE!),
    ).toBeTruthy();
    actions.reserveAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    await act(async () => void fireEvent.click(continueButton()));
    await waitFor(() =>
      expect(screen.getByText(c.error_UNKNOWN!)).toBeTruthy(),
    );
  });

  it("code promo : prix réduits selon la règle ; code refusé : message ; retiré : prix normal", async () => {
    const promo = {
      code: "MOINS10",
      discountType: "PERCENT" as const,
      percentOffBps: 1_000,
      amountOffMinor: null,
      ticketTypeIds: [],
      unlocked: [],
    };
    const reduced =
      1_000 -
      unitDiscount(1_000, {
        id: "",
        eventId: "",
        code: promo.code,
        discountType: promo.discountType,
        percentOffBps: promo.percentOffBps,
        amountOffMinor: promo.amountOffMinor,
        ticketTypeIds: [],
        usedCount: 0,
        isActive: true,
      });
    draw();
    fireEvent.click(screen.getByRole("button", { name: c.promoToggle }));
    fireEvent.change(screen.getByLabelText(c.promoLabel!), {
      target: { value: "FAUX" },
    });
    actions.previewPromoAction.mockResolvedValue({
      ok: false,
      error: "QUELQUE_CHOSE",
    });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: c.promoApply }),
        ),
    );
    expect(await screen.findByText(c.error_PROMO_NOT_FOUND!)).toBeTruthy();
    actions.previewPromoAction.mockResolvedValue({ ok: true, data: promo });
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: c.promoApply }),
        ),
    );
    expect(actions.previewPromoAction).toHaveBeenLastCalledWith("e1", "FAUX");
    expect(
      screen.getAllByText((t) => norm(t) === norm(money(reduced))).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: c.promoRemove }));
    expect(
      screen.getAllByText((t) => norm(t) === norm(money(1_000))).length,
    ).toBeGreaterThan(0);
  });

  it("tarif complet : « Complet » et liste d'attente ; tout complet : ni code promo ni bouton continuer", () => {
    draw({ tickets: [tk("A", { remaining: 0 })] });
    expect(screen.getByText(p.soldOut!)).toBeTruthy();
    expect(screen.getByRole("button", { name: p.waitlistJoin })).toBeTruthy();
    expect(screen.queryByRole("button", { name: c.promoToggle })).toBeNull();
    expect(screen.queryByRole("button", { name: p.continue })).toBeNull();
  });

  it("options : un billet d'abord, sauf les options vendables seules ; plafond du stock ; options seules achetables", async () => {
    actions.reserveAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    draw({
      options: [
        {
          id: "o1",
          name: "Vestiaire",
          description: null,
          priceMinor: 200,
          maxPerOrder: 4,
          left: 1,
          standalone: true,
        },
        {
          id: "o2",
          name: "Boisson",
          description: null,
          priceMinor: 300,
          maxPerOrder: 4,
          left: null,
        },
      ],
    });
    expect(
      screen.getByText((t) =>
        norm(t).startsWith(norm(p.optionsStandaloneHint!).slice(0, 30)),
      ),
    ).toBeTruthy();
    const boisson = screen.getByRole("button", {
      name: p.optionMore!.replace("{name}", "Boisson"),
    }) as HTMLButtonElement;
    const vestiaire = screen.getByRole("button", {
      name: p.optionMore!.replace("{name}", "Vestiaire"),
    }) as HTMLButtonElement;
    expect(boisson.disabled).toBe(true); // demande un billet
    click(vestiaire, 3);
    expect(vestiaire.disabled).toBe(true); // un seul vestiaire disponible
    expect(continueButton().disabled).toBe(false); // option seule achetable
    await act(async () => void fireEvent.click(continueButton()));
    expect(actions.reserveAction.mock.calls[0]![1]).toEqual([]);
    expect(actions.reserveAction.mock.calls[0]![6]).toEqual([
      { optionId: "o1", quantity: 1 },
    ]);
  });

  it("aperçu : aucun achat possible ; vente pas encore ouverte : pas de choix de quantité", () => {
    const a = draw({ state: "PREVIEW" });
    click(more("Tarif A"));
    expect(continueButton().disabled).toBe(true);
    expect(screen.getByText(p.previewNoPurchase!)).toBeTruthy();
    a.unmount();
    draw({ state: "NOT_STARTED" });
    expect(
      screen.queryByRole("button", {
        name: p.more!.replace("{name}", "Tarif A"),
      }),
    ).toBeNull();
  });

  it("offre de la liste d'attente : bandeau, places limitées à l'offre, jeton transmis ; tables, inclus et prochain palier affichés", async () => {
    actions.reserveAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    const { container } = draw({
      tickets: [
        tk("A", {
          remaining: 0,
          onSale: false,
          groupSize: 6,
          included: ["Bouteille VIP"],
          next: { priceMinor: 1_500, startsAt: "2026-11-01T10:00:00Z" },
        }),
      ],
      waitlistOffer: {
        token: "offre-1",
        ticketTypeId: "A",
        quantity: 2,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    expect(container.textContent).toContain(
      p.waitlistOfferBanner!.split("{")[0]!.trim(),
    );
    expect(norm(container.textContent!)).toContain(
      norm(p.tableIncludes!.replace("{items}", "Bouteille VIP")),
    );
    expect(container.textContent).toContain("6");
    expect(norm(container.textContent!)).toContain(norm(money(1_500)));
    click(more("Tarif A"), 5);
    expect(count("Tarif A")).toBe("2");
    await act(async () => void fireEvent.click(continueButton()));
    expect(actions.reserveAction.mock.calls[0]![7]).toBe("offre-1");
  });
});
