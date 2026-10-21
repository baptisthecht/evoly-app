import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatMoney } from "@evoly/i18n";
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

describe("panier : questions, titulaires, adresse, options", () => {
  const order = {
    id: "q1",
    label: "Comment nous avez-vous connus ?",
    helpText: null,
    type: "SELECT",
    required: true,
    options: ["Un ami", "Instagram"],
    scope: "ORDER",
  };
  const ticket = { id: "q2", label: "Régime alimentaire", helpText: null, type: "TEXT", required: true, options: null, scope: "TICKET" };
  const confirm = () => screen.getByRole("button", { name: fr.checkout.confirmFree });
  const sent = () =>
    (actions.submitBuyerAction.mock.calls[0] as unknown[]).find((x) => x && typeof x === "object" && "firstName" in (x as object)) as Record<string, unknown>;

  it("questions obligatoires : refusées tant qu'elles sont vides, puis envoyées pour la commande et pour chaque billet", async () => {
    actions.submitBuyerAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    draw(reservation({ questions: { order: [order], perLine: { i1: [ticket] } } as never }));
    await fill(user);
    await user.click(confirm());
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText(new RegExp(order.label.replace("?", "\\?"))), "Un ami");
    await user.type(document.getElementById("q-i1-0-q2")!, "Végétarien");
    await user.type(document.getElementById("q-i1-1-q2")!, "Sans gluten");
    await user.click(confirm());
    await waitFor(() => expect(actions.submitBuyerAction).toHaveBeenCalled());
    expect(sent().answers).toEqual({ order: { q1: "Un ami" }, tickets: { i1: [{ q2: "Végétarien" }, { q2: "Sans gluten" }] } });
  });

  it("billets nominatifs : titulaires exigés ; « C'est moi » recopie l'acheteur", async () => {
    actions.submitBuyerAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    draw(reservation({ lines: [{ orderItemId: "i1", ticketTypeId: "t1", name: "Fosse", tierName: null, quantity: 2, unitPriceMinor: 0, nominative: true }] }));
    await fill(user);
    await user.click(confirm());
    expect(actions.submitBuyerAction).not.toHaveBeenCalled();
    expect(screen.getAllByText(fr.checkout.holdersRequired).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: fr.checkout.holderIsMe }));
    const holder = (key: "holderFirstName" | "holderLastName", index: number) =>
      screen.getByLabelText(fr.checkout[key]!.replace("{index}", String(index)).replace("{name}", "Fosse"));
    expect((holder("holderFirstName", 1) as HTMLInputElement).value).toBe("Léa");
    await user.type(holder("holderFirstName", 2), "Tom");
    await user.type(holder("holderLastName", 2), "Dubois");
    await user.click(confirm());
    await waitFor(() => expect(actions.submitBuyerAction).toHaveBeenCalled());
    expect(sent().holders).toEqual({
      i1: [
        { firstName: "Léa", lastName: "Martin" },
        { firstName: "Tom", lastName: "Dubois" },
      ],
    });
  });

  it("faute de frappe dans l'adresse : suggestion proposée, appliquée d'un clic", async () => {
    const user = userEvent.setup();
    draw(reservation());
    await fill(user, { first: "Léa", last: "Martin", email: "lea@gmial.com" });
    await user.tab();
    await user.click(await screen.findByRole("button", { name: /lea@gmail\.com/ }));
    expect((document.getElementById("buyer-email") as HTMLInputElement).value).toBe("lea@gmail.com");
  });

  it("options dans le récapitulatif ; revenir au choix des billets annule la réservation", async () => {
    actions.cancelReservationAction.mockResolvedValue({ ok: true });
    const onCancel = vi.fn();
    const user = userEvent.setup();
    draw(reservation({ options: [{ optionId: "o1", name: "Boisson", quantity: 2, unitPriceMinor: 300 }] }), { onCancel });
    // récapitulatif : la ligne de l'option et son montant, au même formatage que le panier (6 €)
    const summary = document.body.textContent!.replace(/\s+/g, " ");
    expect(summary).toContain("2 × Boisson");
    expect(summary).toContain(formatMoney(600, "EUR", "fr", { trimZeroCents: true }).replace(/\s+/g, " "));
    await user.click(screen.getByRole("button", { name: fr.checkout.changeSelection }));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(actions.cancelReservationAction).toHaveBeenCalledWith("jeton-123");
  });
});
