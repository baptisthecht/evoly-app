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
import { CartView } from "@/components/public/shop/CartView";
import {
  ClearCart,
  WithdrawButton,
} from "@/components/public/shop/OrderActions";
import {
  CartLink,
  ProductBuy,
  ProductGallery,
} from "@/components/public/shop/ProductBuy";
import { ProductGrid } from "@/components/public/shop/ProductGrid";
import { ShopCheckout } from "@/components/public/shop/ShopCheckout";
import { addToCart, readCart, writeCart } from "@/components/public/shop/cart";
import { Fr } from "./intl";

// Boutique publique, lot 3b (section 9.35) : page produit, panier, paiement, page de la commande
const actions = vi.hoisted(() => ({
  cartPreviewAction: vi.fn(),
  reserveCartAction: vi.fn(),
  submitShopBuyerAction: vi.fn(),
  confirmShopPaymentAction: vi.fn(),
  cancelShopReservationAction: vi.fn(),
  withdrawShopOrderAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/boutique/actions", () => actions);
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// paiement simulé : le bouton appelle directement le paiement avec un Stripe factice
const stripe = vi.hoisted(() => ({
  createConfirmationToken: vi.fn(),
  handleNextAction: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/components/public/StripePayment", () => ({
  StripePayment: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PaymentFields: () => <div data-testid="payment-fields" />,
  PayButton: ({
    label,
    onPay,
  }: {
    label: string;
    onPay: (s: unknown, e: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() => onPay(stripe, { submit: stripe.submit })}
    >
      {label}
    </button>
  ),
}));

const p = fr.shopPublic as Record<string, string>;
const wrap = (ui: ReactNode) => render(<Fr>{ui}</Fr>);
const click = async (el: HTMLElement) =>
  act(async () => void fireEvent.click(el));

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  for (const f of Object.values(stripe)) f.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

const options = [
  {
    id: "g",
    name: "Taille",
    values: [
      { id: "s", name: "S" },
      { id: "m", name: "M" },
    ],
  },
];
const variants = [
  { id: "vs", key: "s", priceMinor: 2500, available: 0 },
  { id: "vm", key: "m", priceMinor: 2700, available: 3 },
];

describe("page d'un produit", () => {
  it("galerie : la vignette choisie s'affiche en grand ; sans photo, un fond", () => {
    const images = [
      { url: "https://f/1.png", alt: null },
      { url: "https://f/2.png", alt: "De dos" },
    ];
    const { unmount } = wrap(<ProductGallery name="T-shirt" images={images} />);
    expect(screen.getByAltText("T-shirt")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Afficher la photo 2" }),
    );
    expect(screen.getByAltText("De dos")).toBeTruthy();
    unmount();
    const { container } = wrap(<ProductGallery name="T-shirt" images={[]} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("choix des options : variante disponible d'abord, prix, quantité bornée, ajout au panier", async () => {
    wrap(
      <ProductBuy
        organizationId="org1"
        locale="fr"
        currency="EUR"
        name="T-shirt"
        images={[]}
        options={options}
        variants={variants}
      />,
    );
    // S épuisé : M choisi au départ
    expect(
      (screen.getByRole("radio", { name: "M" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByText(/27\s€/)).toBeTruthy();
    expect(screen.getByText("Plus que 3")).toBeTruthy();
    for (let i = 0; i < 5; i++)
      fireEvent.click(screen.getByRole("button", { name: p.more }));
    expect(screen.getByText("3")).toBeTruthy(); // jamais plus que le stock
    fireEvent.click(screen.getByRole("button", { name: p.less }));
    await click(screen.getByRole("button", { name: p.addToCart }));
    expect(readCart("org1")).toEqual([{ variantId: "vm", quantity: 2 }]);
    expect(screen.getByRole("status").textContent).toContain(p.added);
    // S : épuisé, pas d'ajout possible
    fireEvent.click(screen.getByRole("radio", { name: "S" }));
    expect(screen.getAllByText(p.soldOut!).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: p.addToCart })).toBeNull();
  });

  it("produit sans option et combinaison absente ; lien du panier avec son nombre d'articles", () => {
    const { unmount } = wrap(
      <ProductBuy
        organizationId="org1"
        locale="fr"
        currency="EUR"
        name="Affiche"
        images={[]}
        options={options}
        variants={[{ id: "vm", key: "m", priceMinor: 1500, available: null }]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "S" }));
    expect(screen.getByText(p.unavailable!)).toBeTruthy();
    unmount();
    addToCart("org1", "vx", 2);
    addToCart("org1", "vx", 1);
    wrap(<CartLink organizationId="org1" />);
    expect(screen.getByRole("link").textContent).toContain("3");
  });

  it("grille des produits : prix et pastille « épuisé »", () => {
    wrap(
      <ProductGrid
        soldOutLabel="Épuisé"
        products={[
          {
            id: "1",
            slug: "t-shirt",
            name: "T-shirt",
            imageUrl: "https://f/1.png",
            imageAlt: null,
            price: "25 €",
            soldOut: false,
          },
          {
            id: "2",
            slug: "affiche",
            name: "Affiche",
            imageUrl: null,
            imageAlt: null,
            price: "15 €",
            soldOut: true,
          },
        ]}
      />,
    );
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual(["/boutique/t-shirt", "/boutique/affiche"]);
    expect(screen.getByText("Épuisé")).toBeTruthy();
  });
});

const line = (over: Partial<Record<string, unknown>> = {}) => ({
  variantId: "vm",
  productId: "p1",
  productName: "T-shirt",
  productSlug: "t-shirt",
  variantLabel: "M",
  imageUrl: null,
  unitPriceMinor: 2700,
  vatRateBps: 2100,
  quantity: 2,
  available: 3,
  problem: null,
  pickupEnabled: true,
  shippingEnabled: false,
  ...over,
});

describe("panier", () => {
  it("lignes relues par le serveur, quantités, retrait d'une ligne, total ; « Commander » mène au paiement", async () => {
    writeCart("org1", [
      { variantId: "vm", quantity: 2 },
      { variantId: "gone", quantity: 1 },
    ]);
    actions.cartPreviewAction.mockResolvedValue({ ok: true, data: [line()] });
    actions.reserveCartAction.mockResolvedValue({
      ok: true,
      data: { token: "tok" },
    });
    wrap(
      <CartView
        sub="theatre"
        organizationId="org1"
        locale="fr"
        currency="EUR"
      />,
    );
    await waitFor(() => expect(screen.getByText("T-shirt")).toBeTruthy());
    expect(readCart("org1")).toEqual([{ variantId: "vm", quantity: 2 }]); // ligne disparue retirée
    expect(screen.getByText(/54\s€/)).toBeTruthy();
    actions.cartPreviewAction.mockResolvedValue({
      ok: true,
      data: [line({ quantity: 3 })],
    });
    await click(screen.getByRole("button", { name: "Un T-shirt de plus" }));
    expect(readCart("org1")).toEqual([{ variantId: "vm", quantity: 3 }]);
    await click(screen.getByRole("button", { name: p.checkout }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/boutique/commande/tok"),
    );
    expect(actions.reserveCartAction).toHaveBeenCalledWith("theatre", [
      { variantId: "vm", quantity: 3 },
    ]);
  });

  it("produit épuisé ou indisponible : signalé, commande bloquée ; refus du serveur affiché ; panier vide", async () => {
    writeCart("org1", [{ variantId: "vm", quantity: 4 }]);
    actions.cartPreviewAction.mockResolvedValue({
      ok: true,
      data: [line({ quantity: 4, problem: "NOT_ENOUGH" })],
    });
    const { unmount } = wrap(
      <CartView
        sub="theatre"
        organizationId="org1"
        locale="fr"
        currency="EUR"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Plus que 3"),
    );
    expect(
      (screen.getByRole("button", { name: p.checkout }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    unmount();
    actions.cartPreviewAction.mockResolvedValue({
      ok: true,
      data: [line({ quantity: 4, problem: "UNAVAILABLE" })],
    });
    const second = wrap(
      <CartView
        sub="theatre"
        organizationId="org1"
        locale="fr"
        currency="EUR"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(p.lineUnavailable!)).toBeTruthy(),
    );
    second.unmount();
    actions.cartPreviewAction.mockResolvedValue({
      ok: true,
      data: [line({ quantity: 1 })],
    });
    actions.reserveCartAction.mockResolvedValue({
      ok: false,
      error: "SHOP_OUT_OF_STOCK",
    });
    const third = wrap(
      <CartView
        sub="theatre"
        organizationId="org1"
        locale="fr"
        currency="EUR"
      />,
    );
    await waitFor(() => expect(screen.getByText("T-shirt")).toBeTruthy());
    await click(screen.getByRole("button", { name: p.checkout }));
    await waitFor(() =>
      expect(screen.getByText(p.error_SHOP_OUT_OF_STOCK!)).toBeTruthy(),
    );
    await click(screen.getByRole("button", { name: p.removeLine }));
    third.unmount();
    actions.cartPreviewAction.mockResolvedValue({
      ok: false,
      error: "NOT_FOUND",
    });
    wrap(
      <CartView
        sub="theatre"
        organizationId="org1"
        locale="fr"
        currency="EUR"
      />,
    );
    await waitFor(() => expect(screen.getByText(p.emptyCart!)).toBeTruthy());
  });

  it("produits aux modes de remise incompatibles : message, commande bloquée", async () => {
    writeCart("org1", [
      { variantId: "a", quantity: 1 },
      { variantId: "b", quantity: 1 },
    ]);
    actions.cartPreviewAction.mockResolvedValue({
      ok: true,
      data: [
        line({ variantId: "a" }),
        line({
          variantId: "b",
          productName: "Affiche",
          pickupEnabled: false,
          shippingEnabled: true,
        }),
      ],
    });
    wrap(
      <CartView
        sub="theatre"
        organizationId="org1"
        locale="fr"
        currency="EUR"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(p.modesConflict!)).toBeTruthy(),
    );
  });
});

const checkoutProps = {
  token: "t".repeat(43),
  organizationName: "Théâtre",
  totalMinor: 5400,
  currency: "EUR",
  locale: "fr",
  points: [
    {
      id: "pt1",
      name: "Accueil",
      address: "Rue Haute 1",
      instructions: "Du mardi au samedi",
    },
    { id: "pt2", name: "Bar", address: "Rue Basse 2", instructions: null },
  ],
  publishableKey: "pk_test",
  stripeAccountId: "acct_1",
};
const fill = () => {
  fireEvent.change(screen.getByLabelText(p.firstName!), {
    target: { value: "Léa" },
  });
  fireEvent.change(screen.getByLabelText(p.lastName!), {
    target: { value: "Martin" },
  });
  fireEvent.change(screen.getByLabelText(p.email!), {
    target: { value: "lea@exemple.be" },
  });
};

describe("paiement d'une commande de la boutique", () => {
  it("coordonnées et lieu exigés ; paiement confirmé par le serveur, validation bancaire, page rechargée", async () => {
    stripe.submit.mockResolvedValue({});
    stripe.createConfirmationToken.mockResolvedValue({
      confirmationToken: { id: "ctoken_1" },
    });
    stripe.handleNextAction.mockResolvedValue({});
    actions.submitShopBuyerAction.mockResolvedValue({
      ok: true,
      data: { clientSecret: "cs", stripeAccountId: "acct_1" },
    });
    actions.confirmShopPaymentAction.mockResolvedValue({
      ok: true,
      data: { kind: "ACTION", clientSecret: "cs" },
    });
    wrap(
      <ShopCheckout
        {...checkoutProps}
        expiresAt={new Date(Date.now() + 10 * 60_000).toISOString()}
      />,
    );
    const payButton = screen.getByRole("button", { name: /^Payer/ });
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      fr.checkout.error_INVALID_BUYER,
    );
    fill();
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      p.error_SHOP_PICKUP_REQUIRED,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Bar/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    await click(payButton);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.submitShopBuyerAction.mock.calls[0]![1]).toEqual({
      firstName: "Léa",
      lastName: "Martin",
      email: "lea@exemple.be",
      phone: null,
      marketingOptIn: true,
      pickupPointId: "pt2",
    });
    expect(actions.confirmShopPaymentAction).toHaveBeenCalledWith(
      checkoutProps.token,
      "ctoken_1",
      `/boutique/commande/${checkoutProps.token}`,
    );
    expect(stripe.handleNextAction).toHaveBeenCalled();
  });

  it("erreurs : champs de paiement, coordonnées refusées, carte refusée, validation bancaire échouée ; déjà payée", async () => {
    const props = {
      ...checkoutProps,
      points: [checkoutProps.points[0]!],
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    wrap(<ShopCheckout {...props} />);
    fill();
    const payButton = screen.getByRole("button", { name: /^Payer/ });
    stripe.submit.mockResolvedValue({
      error: { message: "Numéro de carte incomplet." },
    });
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      "Numéro de carte incomplet.",
    );
    stripe.submit.mockResolvedValue({});
    actions.submitShopBuyerAction.mockResolvedValue({
      ok: false,
      error: "BUYER_BLOCKED",
    });
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      fr.checkout.error_BUYER_BLOCKED,
    );
    actions.submitShopBuyerAction.mockResolvedValue({
      ok: true,
      data: { clientSecret: "cs", stripeAccountId: "acct_1" },
    });
    stripe.createConfirmationToken.mockResolvedValue({
      error: { message: "Carte refusée par la banque." },
    });
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      "Carte refusée par la banque.",
    );
    stripe.createConfirmationToken.mockResolvedValue({
      confirmationToken: { id: "ctoken_1" },
    });
    actions.confirmShopPaymentAction.mockResolvedValue({
      ok: false,
      error: "CARD_DECLINED",
    });
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      fr.checkout.error_CARD_DECLINED,
    );
    actions.confirmShopPaymentAction.mockResolvedValue({
      ok: true,
      data: { kind: "ACTION", clientSecret: "cs" },
    });
    stripe.handleNextAction.mockResolvedValue({
      error: { message: "Authentification annulée." },
    });
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      "Authentification annulée.",
    );
    actions.submitShopBuyerAction.mockResolvedValue({
      ok: true,
      data: { paid: true },
    });
    await click(payButton);
    expect(router.refresh).toHaveBeenCalled();
    actions.submitShopBuyerAction.mockResolvedValue({
      ok: false,
      error: "INCONNU",
    });
    await click(payButton);
    expect(screen.getByRole("alert").textContent).toBe(
      fr.checkout.error_UNKNOWN,
    );
    await click(screen.getByRole("button", { name: p.cancelOrder }));
    expect(actions.cancelShopReservationAction).toHaveBeenCalledWith(
      props.token,
    );
    expect(router.push).toHaveBeenCalledWith("/boutique/panier");
  });

  it("réservation expirée ; paiement indisponible ; aucun lieu de retrait", async () => {
    const { unmount } = wrap(
      <ShopCheckout
        {...checkoutProps}
        expiresAt={new Date(Date.now() - 1000).toISOString()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(p.expired);
    fireEvent.click(screen.getByRole("button", { name: p.backToCart }));
    expect(router.push).toHaveBeenCalledWith("/boutique/panier");
    unmount();
    wrap(
      <ShopCheckout
        {...checkoutProps}
        points={[]}
        publishableKey={null}
        expiresAt={new Date(Date.now() + 60_000).toISOString()}
      />,
    );
    expect(screen.getByText(p.error_PAYMENTS_UNAVAILABLE!)).toBeTruthy();
    expect(screen.getByText(p.error_SHOP_PICKUP_REQUIRED!)).toBeTruthy();
  });
});

describe("page de la commande", () => {
  it("rétractation confirmée, envoyée, page rechargée ; refus affiché ; panier vidé après le paiement", async () => {
    writeCart("org1", [{ variantId: "vm", quantity: 1 }]);
    wrap(<ClearCart organizationId="org1" />);
    expect(readCart("org1")).toEqual([]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    actions.withdrawShopOrderAction.mockResolvedValue({ ok: true, data: null });
    wrap(<WithdrawButton token="tok" />);
    await click(screen.getByRole("button", { name: p.withdraw }));
    expect(actions.withdrawShopOrderAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click(screen.getByRole("button", { name: p.withdraw }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    actions.withdrawShopOrderAction.mockResolvedValue({
      ok: false,
      error: "SHOP_WITHDRAWAL_CLOSED",
    });
    await click(screen.getByRole("button", { name: p.withdraw }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        p.error_SHOP_WITHDRAWAL_CLOSED,
      ),
    );
    actions.withdrawShopOrderAction.mockResolvedValue({
      ok: false,
      error: "INCONNU",
    });
    await click(screen.getByRole("button", { name: p.withdraw }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(p.error_UNKNOWN),
    );
  });
});
