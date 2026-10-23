import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

// places réservées au panier (section 9.9) : attribuées d'office, changées sur le plan si l'événement le permet
const seat = (n: number, available = true) => ({
  id: `s${n}`,
  label: String(n),
  order: n,
  x: (n - 1) * 30,
  y: 0,
  categoryId: "c1",
  available,
  accessible: false,
});
const seatMap = (allowChoice: boolean) =>
  ({
    focus: { x: 75, y: -100 },
    blocks: [],
    allowChoice,
    categories: [
      {
        id: "c1",
        name: "Parterre",
        color: "#FFB8E8",
        ticketTypeIds: ["t1"],
        standing: false,
      },
    ],
    rows: [
      {
        id: "r1",
        name: "A",
        blockId: null,
        seats: [1, 2, 3, 4, 5, 6].map((n) => seat(n)),
      },
    ],
  }) as never;
const seated = () =>
  reservation({
    seats: [
      { id: "s1", row: "A", label: "1" },
      { id: "s2", row: "A", label: "2" },
    ],
  } as never);
const drawSeats = (allowChoice: boolean) =>
  render(
    <Fr>
      <CheckoutPanel
        reservation={seated()}
        organizationName="Club test"
        requirePhone={false}
        publishableKey={null}
        onCancel={vi.fn()}
        {...({
          seatMap: seatMap(allowChoice),
          friendName: null,
        } as unknown as Record<string, never>)}
      />
    </Fr>,
  );
const ch = fr.checkout as Record<string, string>;
const sp = (fr as unknown as Record<string, Record<string, string>>)
  .seatPicker!;
const seatLabel = (n: number, state: "selected" | "free") =>
  sp
    .seat!.replace("{row}", "A")
    .replace("{seat}", String(n))
    .replace("{state}", sp[state]!);

describe("panier : places réservées", () => {
  it("changement accepté : nouvelles places envoyées, récapitulatif « choisies » ; refus du serveur expliqué", async () => {
    actions.changeSeatsAction
      .mockResolvedValueOnce({ ok: false, error: "SEAT_TAKEN" })
      .mockResolvedValueOnce({
        ok: true,
        data: [
          { id: "s5", row: "A", label: "5" },
          { id: "s6", row: "A", label: "6" },
        ],
      });
    drawSeats(true);
    expect(screen.getByRole("status").textContent).toContain("1");
    fireEvent.click(screen.getByRole("button", { name: ch.seatsChange }));
    act(
      () =>
        void fireEvent.keyDown(
          screen.getByRole("button", { name: seatLabel(1, "selected") }),
          { key: "Enter" },
        ),
    ); // choix au clavier, comme le test du plan
    act(
      () =>
        void fireEvent.keyDown(
          screen.getByRole("button", { name: seatLabel(2, "selected") }),
          { key: "Enter" },
        ),
    ); // choix au clavier, comme le test du plan
    act(
      () =>
        void fireEvent.keyDown(
          screen.getByRole("button", { name: seatLabel(5, "free") }),
          { key: "Enter" },
        ),
    ); // choix au clavier, comme le test du plan
    act(
      () =>
        void fireEvent.keyDown(
          screen.getByRole("button", { name: seatLabel(6, "free") }),
          { key: "Enter" },
        ),
    ); // choix au clavier, comme le test du plan
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: ch.seatsSave }),
        ),
    );
    expect(await screen.findByRole("alert")).toBeTruthy(); // place prise entre-temps
    await act(
      async () =>
        void fireEvent.click(
          screen.getByRole("button", { name: ch.seatsSave }),
        ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: ch.seatsSave })).toBeNull(),
    );
    expect(actions.changeSeatsAction).toHaveBeenLastCalledWith("jeton-123", [
      "s5",
      "s6",
    ]);
    expect(screen.getByRole("status").textContent).toContain("5");
  });

  it("places non modifiables : plan en consultation, « fermer » le referme sans rien envoyer", () => {
    drawSeats(false);
    fireEvent.click(screen.getByRole("button", { name: ch.seatsView }));
    expect(screen.queryByRole("button", { name: ch.seatsSave })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: ch.seatsClose }));
    expect(screen.getByRole("button", { name: ch.seatsView })).toBeTruthy();
    expect(actions.changeSeatsAction).not.toHaveBeenCalled();
  });
});
