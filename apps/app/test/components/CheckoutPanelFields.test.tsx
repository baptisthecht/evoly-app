import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatMoney } from "@evoly/i18n";
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
vi.mock("@/components/public/StripePayment", () => ({
  StripePayment: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PaymentFields: () => null,
  PayButton: ({ label, onPay }: { label: string; onPay: () => void }) => (
    <button type="button" onClick={onPay}>
      {label}
    </button>
  ),
}));
vi.mock("@/components/public/SeatMapPicker", () => ({
  SeatMapPicker: () => null,
}));

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
  lines: [
    {
      orderItemId: "i1",
      ticketTypeId: "t1",
      name: "Fosse",
      tierName: null,
      quantity: 2,
      unitPriceMinor: 0,
      nominative: false,
    },
  ],
  stripeAccountId: null,
  questions: { order: [], perLine: {} },
  ...over,
});
const assign = vi.fn();
const draw = (
  r: ReservationView,
  props: Partial<{
    requirePhone: boolean;
    publishableKey: string | null;
    onCancel: () => void;
  }> = {},
) =>
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
const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  buyer = { first: "Léa", last: "Martin", email: "lea@exemple.be" },
) => {
  if (buyer.first)
    await user.type(
      screen.getByLabelText(new RegExp(fr.checkout.firstName), {
        selector: "#buyer-first",
      }),
      buyer.first,
    );
  if (buyer.last)
    await user.type(
      screen.getByLabelText(new RegExp(fr.checkout.lastName), {
        selector: "#buyer-last",
      }),
      buyer.last,
    );
  if (buyer.email)
    await user.type(
      screen.getByLabelText(new RegExp(fr.checkout.email), {
        selector: "#buyer-email",
      }),
      buyer.email,
    );
};

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  completed.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

describe("panier : téléphone, actualités, e-mail du titulaire", () => {
  const sent = () =>
    (actions.submitBuyerAction.mock.calls[0] as unknown[]).find(
      (x) => x && typeof x === "object" && "firstName" in (x as object),
    ) as Record<string, unknown>;

  it("téléphone exigé : trop court refusé ; valable, envoyé avec l'accord pour les actualités", async () => {
    actions.submitBuyerAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    draw(reservation(), { requirePhone: true } as never); // téléphone demandé par l'événement
    await fill(user);
    const phone = document.getElementById("buyer-phone") as HTMLInputElement;
    await user.type(phone, "047");
    await user.click(
      screen.getByRole("button", { name: fr.checkout.confirmFree }),
    );
    expect(actions.submitBuyerAction).not.toHaveBeenCalled(); // numéro trop court
    await user.clear(phone);
    await user.type(phone, "+32 470 12 34 56");
    await user.click(
      screen.getByRole("checkbox", { name: /Recevoir les actualités/ }),
    );
    await user.click(
      screen.getByRole("button", { name: fr.checkout.confirmFree }),
    );
    await waitFor(() => expect(actions.submitBuyerAction).toHaveBeenCalled());
    expect(sent()).toMatchObject({
      phone: "+32 470 12 34 56",
      marketingOptIn: true,
    });
  });

  it("tarif qui exige l'e-mail du titulaire : envoyé avec le prénom et le nom", async () => {
    actions.submitBuyerAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    draw(
      reservation({
        lines: [
          {
            orderItemId: "i1",
            ticketTypeId: "t1",
            name: "Fosse",
            tierName: null,
            quantity: 1,
            unitPriceMinor: 0,
            nominative: true,
            holderEmail: true,
          },
        ],
      }),
    );
    await fill(user);
    const label = (key: string) =>
      (fr.checkout as Record<string, string>)
        [key]!.replace("{index}", "1")
        .replace("{name}", "Fosse");
    await user.type(screen.getByLabelText(label("holderFirstName")), "Tom");
    await user.type(screen.getByLabelText(label("holderLastName")), "Dubois");
    await user.type(
      screen.getByLabelText(label("holderEmail")),
      "tom@exemple.be",
    );
    await user.click(
      screen.getByRole("button", { name: fr.checkout.confirmFree }),
    );
    await waitFor(() => expect(actions.submitBuyerAction).toHaveBeenCalled());
    expect(sent().holders).toEqual({
      i1: [{ firstName: "Tom", lastName: "Dubois", email: "tom@exemple.be" }],
    });
  });
});
