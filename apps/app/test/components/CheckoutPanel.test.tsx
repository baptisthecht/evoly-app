import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import type { ReservationView } from "@/app/site/[sub]/[eventSlug]/actions";
import { CheckoutPanel } from "@/components/public/CheckoutPanel";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ submitBuyerAction: vi.fn(), cancelReservationAction: vi.fn(), changeSeatsAction: vi.fn() }));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const completed = vi.hoisted(() => vi.fn());
vi.mock("@/components/public/embedEvents", () => ({ notifyOrderCompleted: completed }));
vi.mock("@/components/public/StripePayment", () => ({
  StripePayment: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentFields: () => null,
  PayButton: ({ label, onPay }: { label: string; onPay: () => void }) => (
    <button type="button" onClick={onPay}>
      {label}
    </button>
  ),
}));
vi.mock("@/components/public/SeatMapPicker", () => ({ SeatMapPicker: () => null }));

const reservation = (over: Partial<ReservationView> = {}): ReservationView => ({
  options: [],
  token: "jeton-123",
  reference: "EVO-ABC",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  currency: "EUR",
  totalMinor: 0,
  isFree: true,
  discountMinor: 0,
  promoCode: null,
  lines: [{ orderItemId: "i1", ticketTypeId: "t1", name: "Fosse", tierName: null, quantity: 2, unitPriceMinor: 0, nominative: false }],
  stripeAccountId: null,
  questions: { order: [], perLine: {} },
  ...over,
});
const assign = vi.fn();
const draw = (r: ReservationView, props: Partial<{ requirePhone: boolean; publishableKey: string | null; onCancel: () => void }> = {}) =>
  render(
    <Fr>
      <CheckoutPanel
        reservation={r}
        organizationName="Club test"
        requirePhone={props.requirePhone ?? false}
        publishableKey={props.publishableKey ?? null}
        onCancel={props.onCancel ?? vi.fn()}
      />
    </Fr>,
  );
const fill = async (user: ReturnType<typeof userEvent.setup>, buyer = { first: "Léa", last: "Martin", email: "lea@exemple.be" }) => {
  if (buyer.first) await user.type(screen.getByLabelText(new RegExp(fr.checkout.firstName), { selector: "#buyer-first" }), buyer.first);
  if (buyer.last) await user.type(screen.getByLabelText(new RegExp(fr.checkout.lastName), { selector: "#buyer-last" }), buyer.last);
  if (buyer.email) await user.type(screen.getByLabelText(new RegExp(fr.checkout.email), { selector: "#buyer-email" }), buyer.email);
};

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  completed.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

describe("panier (paiement et commande gratuite)", () => {
  it("commande gratuite remplie : coordonnées envoyées, commande terminée signalée, acheteur envoyé vers ses billets", async () => {
    actions.submitBuyerAction.mockResolvedValue({ ok: true });
    draw(reservation());
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: fr.checkout.confirmFree }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/billets/jeton-123"));
    expect(actions.submitBuyerAction).toHaveBeenCalledWith(
      "jeton-123",
      expect.objectContaining({ firstName: "Léa", lastName: "Martin", email: "lea@exemple.be" }),
    );
    expect(completed).toHaveBeenCalledWith(2, 0, "EUR");
  });

  it("formulaire vide ou adresse invalide : erreurs affichées, rien n'est envoyé", async () => {
    draw(reservation());
    const user = userEvent.setup();
    await fill(user, { first: "", last: "", email: "lea@exemple" });
    await user.click(screen.getByRole("button", { name: fr.checkout.confirmFree }));
    expect(screen.getAllByText(fr.checkout.required).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(fr.checkout.invalidEmail)).toBeTruthy();
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
  });

  it("refus du serveur : l'explication s'affiche et le bouton redevient utilisable", async () => {
    actions.submitBuyerAction.mockResolvedValue({ ok: false, error: "QUELQUE_CHOSE_D_INCONNU" });
    draw(reservation());
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: fr.checkout.confirmFree }));
    await screen.findByText(fr.checkout.error_UNKNOWN);
    expect((screen.getByRole("button", { name: fr.checkout.confirmFree }) as HTMLButtonElement).disabled).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("réservation expirée : le panier l'annonce et propose de recommencer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      draw(reservation({ expiresAt: new Date(Date.now() + 2_000).toISOString() }));
      expect(screen.queryByText(fr.checkout.expired)).toBeNull();
      await act(async () => void (await vi.advanceTimersByTimeAsync(3_000)));
      expect(screen.getByText(fr.checkout.expired)).toBeTruthy();
      expect(screen.getByRole("button", { name: fr.checkout.restart })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("billet payant sans paiement configuré : le panier le dit, aucun bouton de paiement inutilisable", () => {
    draw(
      reservation({
        isFree: false,
        totalMinor: 2_500,
        lines: [{ orderItemId: "i1", ticketTypeId: "t1", name: "Fosse", tierName: null, quantity: 1, unitPriceMinor: 2_500, nominative: false }],
      }),
    );
    expect(screen.getByText(fr.checkout.paymentsUnavailable)).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(fr.checkout.confirmFree) })).toBeNull();
  });

  it("billets nominatifs sans les noms : l'envoi est bloqué", async () => {
    draw(reservation({ lines: [{ orderItemId: "i1", ticketTypeId: "t1", name: "Gala", tierName: null, quantity: 2, unitPriceMinor: 0, nominative: true }] }));
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: fr.checkout.confirmFree }));
    expect(screen.getByText(fr.checkout.holdersRequired)).toBeTruthy();
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
  });

  it("téléphone obligatoire : l'envoi est bloqué tant qu'il manque", async () => {
    draw(reservation(), { requirePhone: true });
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: fr.checkout.confirmFree }));
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
    expect(screen.getAllByText(fr.checkout.required).length).toBeGreaterThanOrEqual(1);
  });
});
