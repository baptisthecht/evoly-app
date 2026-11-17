import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  ShopOrdersTable,
  type ShopOrderItem,
} from "@/app/o/[orgSlug]/shop/ShopOrdersTable";
import {
  FulfillmentButtons,
  RefundForm,
} from "@/app/o/[orgSlug]/shop/orders/[orderId]/OrderDetail";
import { PickupScanner } from "@/app/o/[orgSlug]/shop/pickup/PickupScanner";
import { Fr } from "./intl";

// Commandes de la boutique, lot 3b (section 9.35) : tableau, préparation, remboursement, scan des retraits
const actions = vi.hoisted(() => ({
  fulfillmentAction: vi.fn(),
  refundShopOrderAction: vi.fn(),
  pickupLookupAction: vi.fn(),
  pickupConfirmAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/shop/actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/o/club/shop",
}));
vi.mock("@/components/scanner/CameraScanner", () => ({
  CameraScanner: ({ onCode }: { onCode: (c: string) => void }) => (
    <button type="button" onClick={() => onCode("AB3DEF7H9K")}>
      caméra
    </button>
  ),
}));

const o = fr.shopOrders as Record<string, string>;
const wrap = (ui: ReactNode) => render(<Fr>{ui}</Fr>);
const click = async (el: HTMLElement) =>
  act(async () => void fireEvent.click(el));
const sent = (fn: ReturnType<typeof vi.fn>, i = 0) =>
  Object.fromEntries((fn.mock.calls[i]!.at(-1) as FormData).entries());

beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
});
afterEach(() => vi.restoreAllMocks());

const rows: ShopOrderItem[] = [
  {
    id: "o1",
    reference: "EVS-7KQ2-4X9M",
    buyer: "Léa Martin",
    email: "lea@exemple.be",
    items: 3,
    total: "77 €",
    totalMinor: 7700,
    status: "PAID",
    fulfillmentStatus: "TO_PREPARE",
    withdrawal: false,
    date: "17 nov. 2026, 14:05",
    dateAt: 2,
    href: "/o/club/shop/orders/o1",
  },
  {
    id: "o2",
    reference: "EVS-AAAA-BBBB",
    buyer: "",
    email: "marc@exemple.be",
    items: 1,
    total: "25 €",
    totalMinor: 2500,
    status: "PARTIALLY_REFUNDED",
    fulfillmentStatus: "PICKED_UP",
    withdrawal: true,
    date: "16 nov. 2026, 09:00",
    dateAt: 1,
    href: "/o/club/shop/orders/o2",
  },
];

describe("Boutique, onglet Commandes", () => {
  it("acheteur, référence, articles, total, états, rétractation ; recherche", () => {
    wrap(<ShopOrdersTable rows={rows} />);
    for (const text of [
      "Léa Martin",
      "marc@exemple.be",
      "EVS-7KQ2-4X9M",
      "3 articles",
      "77 €",
      o.fulfillment_TO_PREPARE!,
      o.fulfillment_PICKED_UP!,
      o.payment_PARTIALLY_REFUNDED!,
      o.withdrawalBadge!,
    ])
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText(o.search!), {
      target: { value: "aaaa" },
    });
    expect(screen.queryAllByText("Léa Martin")).toHaveLength(0);
    fireEvent.change(screen.getByPlaceholderText(o.search!), {
      target: { value: "zzz" },
    });
    expect(screen.getByText(o.noMatch!)).toBeTruthy();
  });

  it("aucune commande : l'état vide", () => {
    wrap(<ShopOrdersTable rows={[]} />);
    expect(screen.getByText(o.emptyTitle!)).toBeTruthy();
  });
});

describe("fiche d'une commande de la boutique", () => {
  it("préparation : prête à retirer, puis retirée ; erreur affichée ; rien pour une commande remise ou sans droit", async () => {
    actions.fulfillmentAction.mockResolvedValue({
      ok: false,
      error: "SHOP_ORDER_STATE",
    });
    const { unmount } = wrap(
      <FulfillmentButtons
        orgSlug="club"
        orderId="o1"
        status="TO_PREPARE"
        canManage
      />,
    );
    await click(screen.getByRole("button", { name: o.markReady }));
    await waitFor(() =>
      expect(screen.getByText(fr.formErrors.SHOP_ORDER_STATE)).toBeTruthy(),
    );
    expect(actions.fulfillmentAction.mock.calls[0]!.slice(0, 2)).toEqual([
      "club",
      "o1",
    ]);
    expect(sent(actions.fulfillmentAction)).toEqual({ step: "READY" });
    unmount();
    const ready = wrap(
      <FulfillmentButtons
        orgSlug="club"
        orderId="o1"
        status="READY"
        canManage
      />,
    );
    expect(screen.queryByRole("button", { name: o.markReady })).toBeNull();
    await click(screen.getByRole("button", { name: o.markPickedUp }));
    await waitFor(() =>
      expect(actions.fulfillmentAction).toHaveBeenCalledTimes(2),
    );
    expect(sent(actions.fulfillmentAction, 1)).toEqual({ step: "PICKED_UP" });
    ready.unmount();
    const done = wrap(
      <FulfillmentButtons
        orgSlug="club"
        orderId="o1"
        status="PICKED_UP"
        canManage
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    done.unmount();
    wrap(
      <FulfillmentButtons
        orgSlug="club"
        orderId="o1"
        status="READY"
        canManage={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("remboursement : quantités bornées, montant annoncé, confirmé ; rétractation : tout proposé ; rien à rembourser", async () => {
    const lines = [
      {
        id: "l1",
        name: "T-shirt (S)",
        left: 2,
        unitPriceMinor: 2500,
        unitPrice: "25 €",
      },
      {
        id: "l2",
        name: "T-shirt (M)",
        left: 0,
        unitPriceMinor: 2700,
        unitPrice: "27 €",
      },
    ];
    const { unmount } = wrap(
      <RefundForm
        orgSlug="club"
        orderId="o1"
        lines={lines}
        currency="EUR"
        locale="fr"
        withdrawal={false}
      />,
    );
    const button = () =>
      screen.getByRole("button", { name: /^Rembourser/ }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    const qty = screen.getByLabelText("Quantité à rembourser : T-shirt (S)");
    fireEvent.change(qty, { target: { value: "9" } });
    expect((qty as HTMLInputElement).value).toBe("2");
    expect(button().textContent).toMatch(/50,00\s€/);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await click(button());
    expect(actions.refundShopOrderAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click(button());
    await waitFor(() =>
      expect(actions.refundShopOrderAction).toHaveBeenCalled(),
    );
    expect(sent(actions.refundShopOrderAction)).toEqual({
      "qty.l1": "2",
      restock: "on",
    });
    await waitFor(() => expect(screen.getByText(o.refundDone!)).toBeTruthy());
    unmount();
    const withdrawal = wrap(
      <RefundForm
        orgSlug="club"
        orderId="o1"
        lines={lines}
        currency="EUR"
        locale="fr"
        withdrawal
      />,
    );
    expect(
      (
        screen.getByLabelText(
          "Quantité à rembourser : T-shirt (S)",
        ) as HTMLInputElement
      ).value,
    ).toBe("2");
    withdrawal.unmount();
    const { container } = wrap(
      <RefundForm
        orgSlug="club"
        orderId="o1"
        lines={[{ ...lines[1]! }]}
        currency="EUR"
        locale="fr"
        withdrawal={false}
      />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("scan des retraits", () => {
  const found = {
    id: "o1",
    reference: "EVS-7KQ2-4X9M",
    buyer: "Léa Martin",
    status: "PAID",
    fulfillmentStatus: "READY",
    withdrawal: true,
    lines: [{ name: "T-shirt (S)", quantity: 2, refunded: 1 }],
  };

  it("code scanné : commande affichée, remise confirmée ; code saisi inconnu : message", async () => {
    actions.pickupLookupAction.mockResolvedValue({ ok: true, data: found });
    wrap(<PickupScanner orgSlug="club" />);
    await click(screen.getByRole("button", { name: "caméra" }));
    await waitFor(() =>
      expect(screen.getByText("Léa Martin · EVS-7KQ2-4X9M")).toBeTruthy(),
    );
    expect(actions.pickupLookupAction).toHaveBeenCalledWith(
      "club",
      "AB3DEF7H9K",
    );
    expect(screen.getByText("1 × T-shirt (S)")).toBeTruthy();
    expect(screen.getAllByText(o.withdrawalBadge!).length).toBeGreaterThan(0);
    await click(screen.getByRole("button", { name: o.handOver }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Commande EVS-7KQ2-4X9M remise.",
      ),
    );
    expect(actions.pickupConfirmAction).toHaveBeenCalledWith("club", "o1");
    actions.pickupLookupAction.mockResolvedValue({
      ok: false,
      error: "NOT_FOUND",
    });
    fireEvent.change(screen.getByLabelText(o.pickupCode!), {
      target: { value: "ZZZ" },
    });
    await click(screen.getByRole("button", { name: o.pickupFind }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(o.pickupNotFound),
    );
  });

  it("déjà remise, remboursée, refus du serveur, annulation", async () => {
    actions.pickupLookupAction.mockResolvedValue({
      ok: true,
      data: { ...found, withdrawal: false, fulfillmentStatus: "PICKED_UP" },
    });
    wrap(<PickupScanner orgSlug="club" />);
    await click(screen.getByRole("button", { name: "caméra" }));
    await waitFor(() =>
      expect(screen.getByText(o.alreadyPickedUp!)).toBeTruthy(),
    );
    actions.pickupLookupAction.mockResolvedValue({
      ok: true,
      data: { ...found, status: "REFUNDED" },
    });
    fireEvent.change(screen.getByLabelText(o.pickupCode!), {
      target: { value: "AB3DEF7H9K" },
    });
    await click(screen.getByRole("button", { name: o.pickupFind }));
    await waitFor(() =>
      expect(screen.getByText(o.payment_REFUNDED!)).toBeTruthy(),
    );
    actions.pickupLookupAction.mockResolvedValue({ ok: true, data: found });
    await click(screen.getByRole("button", { name: o.pickupFind }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: o.handOver })).toBeTruthy(),
    );
    actions.pickupConfirmAction.mockResolvedValue({
      ok: false,
      error: "FORBIDDEN",
    });
    await click(screen.getByRole("button", { name: o.handOver }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        fr.formErrors.FORBIDDEN,
      ),
    );
    await click(screen.getByRole("button", { name: o.pickupCancel }));
    expect(screen.queryByRole("button", { name: o.handOver })).toBeNull();
    actions.pickupLookupAction.mockResolvedValue({
      ok: false,
      error: "INCONNU",
    });
    await click(screen.getByRole("button", { name: o.pickupFind }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(fr.formErrors.generic),
    );
    fireEvent.change(screen.getByLabelText(o.pickupCode!), {
      target: { value: " " },
    });
    await click(screen.getByRole("button", { name: o.pickupFind }));
  });
});
