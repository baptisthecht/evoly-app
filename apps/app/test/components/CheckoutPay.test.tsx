import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import type { ReservationView } from "@/app/site/[sub]/[eventSlug]/actions";
import { CheckoutPanel } from "@/components/public/CheckoutPanel";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  submitBuyerAction: vi.fn(),
  cancelReservationAction: vi.fn(),
  changeSeatsAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const completed = vi.hoisted(() => vi.fn());
vi.mock("@/components/public/embedEvents", () => ({
  notifyOrderCompleted: completed,
}));
vi.mock("@/components/public/SeatMapPicker", () => ({
  SeatMapPicker: () => null,
}));

const c = (fr as unknown as Record<string, Record<string, string>>).checkout!;
const molliePage = "https://www.mollie.com/checkout/select-method/abc";
// organisateur dont le compte Mollie est prêt : paiement sur la page de Mollie
const reservation: ReservationView = {
  options: [],
  token: "jeton",
  reference: "EVO-ABC",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  currency: "EUR",
  totalMinor: 2_500,
  isFree: false,
  discountMinor: 0,
  promoCode: null,
  lines: [
    {
      orderItemId: "i1",
      ticketTypeId: "t1",
      name: "Fosse",
      tierName: null,
      quantity: 1,
      unitPriceMinor: 2_500,
      nominative: false,
    },
  ],
  mollie: true,
  questions: { order: [], perLine: {} },
};
const assign = vi.fn();
beforeEach(() => {
  for (const f of [...Object.values(actions), completed, assign]) f.mockReset();
  actions.submitBuyerAction.mockResolvedValue({
    ok: true,
    data: { kind: "REDIRECT", url: molliePage },
  });
  vi.stubGlobal("location", {
    ...window.location,
    origin: "https://club.evoly.me",
    href: "https://club.evoly.me/gala",
    assign,
  });
});
afterEach(() => vi.unstubAllGlobals());
const draw = (r: ReservationView = reservation) =>
  render(
    <Fr>
      <CheckoutPanel
        reservation={r}
        organizationName="Club"
        requirePhone={false}
        onCancel={vi.fn()}
      />
    </Fr>,
  );
const fill = async () => {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText(new RegExp(c.firstName!), {
      selector: "#buyer-first",
    }),
    "Léa",
  );
  await user.type(
    screen.getByLabelText(new RegExp(c.lastName!), { selector: "#buyer-last" }),
    "Martin",
  );
  await user.type(
    screen.getByLabelText(new RegExp(c.email!), { selector: "#buyer-email" }),
    "lea@exemple.be",
  );
};
const payButton = () =>
  screen.getByRole("button", {
    name: (n) => n.startsWith(c.pay!.split("{")[0]!.trim()),
  }) as HTMLButtonElement;
const pay = async () => act(async () => void fireEvent.click(payButton()));

describe("paiement par Mollie (RG-BUY-04 à 06, docs/MOLLIE.md)", () => {
  it("réussi : coordonnées envoyées, puis la page de paiement de Mollie ; la commande n'est annoncée terminée qu'au retour", async () => {
    draw();
    expect(screen.getByText(c.mollieNotice!)).toBeTruthy();
    await fill();
    await pay();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(molliePage));
    expect(actions.submitBuyerAction).toHaveBeenCalledWith(
      "jeton",
      expect.objectContaining({
        firstName: "Léa",
        lastName: "Martin",
        email: "lea@exemple.be",
      }),
    );
    // pas encore payée : la page des billets, au retour de Mollie, prévient la page d'origine (RG-EMB-07)
    expect(completed).not.toHaveBeenCalled();
  });

  it("commande entièrement couverte par une réduction : confirmée sans passer par Mollie, puis les billets", async () => {
    actions.submitBuyerAction.mockResolvedValue({
      ok: true,
      data: { kind: "PAID" },
    });
    draw({
      ...reservation,
      totalMinor: 0,
      isFree: true,
      discountMinor: 2_500,
      promoCode: "OFFERT",
    });
    expect(screen.queryByText(c.mollieNotice!)).toBeNull();
    await fill();
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: c.confirmFree }),
        ),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/billets/jeton"));
    expect(assign).toHaveBeenCalledTimes(1); // jamais la page de Mollie
    expect(completed).toHaveBeenCalledWith(1, 0, "EUR");
  });

  it("déjà payée chez Mollie (paiement terminé entre-temps) : pas de second paiement, les billets", async () => {
    actions.submitBuyerAction.mockResolvedValue({
      ok: true,
      data: { kind: "PAID" },
    });
    draw();
    await fill();
    await pay();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/billets/jeton"));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith(1, 2_500, "EUR");
  });

  it("coordonnées refusées : le motif s'affiche, l'acheteur reste sur le panier et peut réessayer", async () => {
    actions.submitBuyerAction.mockResolvedValue({
      ok: false,
      error: "HOLD_EXPIRED",
    });
    draw();
    await fill();
    await pay();
    expect((await screen.findByRole("alert")).textContent).toBe(
      c.error_HOLD_EXPIRED,
    );
    expect(assign).not.toHaveBeenCalled();
    expect(payButton().disabled).toBe(false);
    expect(
      (document.getElementById("buyer-email") as HTMLInputElement).value,
    ).toBe("lea@exemple.be"); // formulaire toujours rempli (RG-BUY-06)
    actions.submitBuyerAction.mockResolvedValue({
      ok: true,
      data: { kind: "REDIRECT", url: molliePage },
    });
    await pay();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(molliePage));
  });

  it("réponse inattendue ou refus inconnu : message générique, rien n'est ouvert", async () => {
    actions.submitBuyerAction.mockResolvedValue({
      ok: true,
      data: { kind: "AUTRE" },
    });
    draw();
    await fill();
    await pay();
    expect((await screen.findByRole("alert")).textContent).toBe(
      c.error_UNKNOWN,
    );
    expect(payButton().disabled).toBe(false);
    actions.submitBuyerAction.mockResolvedValue({
      ok: false,
      error: "INCONNUE",
    });
    await pay();
    await waitFor(() =>
      expect(actions.submitBuyerAction).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByRole("alert").textContent).toBe(c.error_UNKNOWN);
    expect(assign).not.toHaveBeenCalled();
  });

  it("formulaire incomplet : le paiement ne démarre pas", async () => {
    draw();
    await pay();
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("pendant l'envoi : bouton inactif qui annonce le traitement, un second clic n'envoie rien", async () => {
    let finish: (v: unknown) => void = () => undefined;
    actions.submitBuyerAction.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    draw();
    await fill();
    await pay();
    const busy = screen.getByRole("button", { name: c.processing });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await act(async () => void fireEvent.click(busy));
    expect(actions.submitBuyerAction).toHaveBeenCalledTimes(1);
    await act(
      async () =>
        void finish({ ok: true, data: { kind: "REDIRECT", url: molliePage } }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith(molliePage));
  });
});
