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
  confirmPaymentAction: vi.fn(),
  cancelReservationAction: vi.fn(),
  changeSeatsAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const completed = vi.hoisted(() => vi.fn());
vi.mock("@/components/public/embedEvents", () => ({
  notifyOrderCompleted: completed,
}));
const stripe = vi.hoisted(() => ({
  elements: { submit: vi.fn() },
  client: { createConfirmationToken: vi.fn(), handleNextAction: vi.fn() },
}));
vi.mock("@/components/public/StripePayment", () => ({
  StripePayment: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PaymentFields: () => null,
  PayButton: ({
    label,
    busy,
    onPay,
  }: {
    label: string;
    busy: boolean;
    onPay: (s: unknown, e: unknown) => void;
  }) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => onPay(stripe.client, stripe.elements)}
    >
      {label}
    </button>
  ),
}));
vi.mock("@/components/public/SeatMapPicker", () => ({
  SeatMapPicker: () => null,
}));

const c = (fr as unknown as Record<string, Record<string, string>>).checkout!;
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
  stripeAccountId: "acct_club",
  questions: { order: [], perLine: {} },
};
const assign = vi.fn();
beforeEach(() => {
  for (const f of [
    ...Object.values(actions),
    completed,
    assign,
    stripe.elements.submit,
    stripe.client.createConfirmationToken,
    stripe.client.handleNextAction,
  ])
    f.mockReset();
  stripe.elements.submit.mockResolvedValue({});
  stripe.client.createConfirmationToken.mockResolvedValue({
    confirmationToken: { id: "ctoken_abc" },
  });
  stripe.client.handleNextAction.mockResolvedValue({});
  actions.confirmPaymentAction.mockResolvedValue({
    ok: true,
    data: { kind: "DONE" },
  });
  actions.submitBuyerAction.mockResolvedValue({
    ok: true,
    data: { kind: "PAY", clientSecret: "pi_secret_123" },
  });
  vi.stubGlobal("location", {
    ...window.location,
    origin: "https://club.evoly.me",
    href: "https://club.evoly.me/gala",
    assign,
  });
});
afterEach(() => vi.unstubAllGlobals());
const draw = () =>
  render(
    <Fr>
      <CheckoutPanel
        reservation={reservation}
        organizationName="Club"
        requirePhone={false}
        publishableKey="pk_test_123"
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
  });
const pay = async () => act(async () => void fireEvent.click(payButton()));

describe("paiement par carte (RG-BUY-04 à 06)", () => {
  it("réussi : carte vérifiée, coordonnées envoyées, paiement confirmé chez Stripe sans quitter la page, puis les billets", async () => {
    draw();
    await fill();
    await pay();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/billets/jeton"));
    expect(stripe.elements.submit).toHaveBeenCalled();
    expect(actions.submitBuyerAction).toHaveBeenCalledWith(
      "jeton",
      expect.objectContaining({ email: "lea@exemple.be" }),
    );
    const args = stripe.client.createConfirmationToken.mock.calls[0]![0] as {
      params: {
        return_url: string;
        payment_method_data: {
          billing_details: { name: string; email: string };
        };
      };
    };
    expect([
      args.params.return_url,
      args.params.payment_method_data.billing_details,
    ]).toEqual([
      "https://club.evoly.me/billets/jeton",
      { name: "Léa Martin", email: "lea@exemple.be" },
    ]);
    // le serveur lit l'empreinte de la carte, puis confirme : rien n'est confirmé depuis le navigateur
    expect(actions.confirmPaymentAction).toHaveBeenCalledWith(
      "jeton",
      "ctoken_abc",
      "/billets/jeton",
    );
    expect(stripe.client.handleNextAction).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledWith(1, 2_500, "EUR");
  });

  it("carte incomplète : erreur affichée, aucune commande envoyée", async () => {
    stripe.elements.submit.mockResolvedValue({
      error: { message: "Le numéro de carte est incomplet." },
    });
    draw();
    await fill();
    await pay();
    expect(
      await screen.findByText("Le numéro de carte est incomplet."),
    ).toBeTruthy();
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
  });

  it("coordonnées refusées : expliqué, Stripe jamais sollicité", async () => {
    actions.submitBuyerAction.mockResolvedValue({
      ok: false,
      error: "INCONNUE",
    });
    draw();
    await fill();
    await pay();
    expect(await screen.findByText(c.error_UNKNOWN!)).toBeTruthy();
    expect(stripe.client.createConfirmationToken).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("commande entièrement couverte par une réduction : validée sans paiement", async () => {
    actions.submitBuyerAction.mockResolvedValue({
      ok: true,
      data: { kind: "PAID" },
    });
    draw();
    await fill();
    await pay();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/billets/jeton"));
    expect(stripe.client.createConfirmationToken).not.toHaveBeenCalled();
  });

  it("paiement refusé par Stripe : le motif s'affiche, l'acheteur reste sur le panier", async () => {
    actions.confirmPaymentAction.mockResolvedValue({
      ok: false,
      error: "CARD_DECLINED",
    });
    draw();
    await fill();
    await pay();
    expect(await screen.findByText(c.error_CARD_DECLINED!)).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect((payButton() as HTMLButtonElement).disabled).toBe(false); // l'acheteur peut réessayer
  });

  it("formulaire incomplet : le paiement ne démarre pas", async () => {
    draw();
    await pay();
    expect(stripe.elements.submit).not.toHaveBeenCalled();
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
  });

  it("validation bancaire demandée (3D Secure) : présentée, puis les billets", async () => {
    actions.confirmPaymentAction.mockResolvedValue({
      ok: true,
      data: { kind: "ACTION", clientSecret: "pi_secret_3ds" },
    });
    draw();
    await fill();
    await pay();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/billets/jeton"));
    expect(stripe.client.handleNextAction).toHaveBeenCalledWith({
      clientSecret: "pi_secret_3ds",
    });
  });

  it("carte mal saisie : signalée avant d'appeler le serveur", async () => {
    stripe.client.createConfirmationToken.mockResolvedValue({
      error: { message: "Numéro de carte incomplet." },
    });
    draw();
    await fill();
    await pay();
    expect(await screen.findByText("Numéro de carte incomplet.")).toBeTruthy();
    expect(actions.confirmPaymentAction).not.toHaveBeenCalled();
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
  });
});
