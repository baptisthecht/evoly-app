import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import {
  NewProductDialog,
  ProductsTable,
  ShopPreview,
  type ProductItem,
} from "@/app/o/[orgSlug]/shop/ProductsTable";
import {
  DeliveryView,
  type PickupPointItem,
  type ShippingMethodItem,
} from "@/app/o/[orgSlug]/shop/DeliveryView";
import {
  DeleteProduct,
  ProductImages,
  ProductInfoForm,
  ProductOptionsEditor,
  ProductStatusForm,
  VariantsForm,
  type VariantItem,
} from "@/app/o/[orgSlug]/shop/products/[productId]/ProductEditor";
import { Fr } from "./intl";

// Boutique, lot 3a (section 9.35) : écrans de l'organisateur (catalogue, retrait et livraison, fiche d'un produit)
const actions = vi.hoisted(() => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  productStatusAction: vi.fn(),
  productFeaturedAction: vi.fn(),
  deleteProductAction: vi.fn(),
  saveOptionsAction: vi.fn(),
  saveVariantsAction: vi.fn(),
  addImageAction: vi.fn(),
  imageCommandAction: vi.fn(),
  savePickupPointAction: vi.fn(),
  saveShippingMethodAction: vi.fn(),
  deliveryCommandAction: vi.fn(),
}));
vi.mock("@/app/o/[orgSlug]/shop/actions", () => actions);
const upload = vi.hoisted(() => ({ uploadFile: vi.fn() }));
vi.mock("@/app/o/[orgSlug]/brand/BrandClient", () => upload);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/o/club/shop",
}));

const s = fr.shop as Record<string, string>;
const fe = fr.formErrors as Record<string, string>;
const fill = (msg: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (out, [k, v]) => out.replace(`{${k}}`, String(v)),
    msg,
  );
const wrap = (ui: React.ReactNode) => render(<Fr>{ui}</Fr>);
const sent = (fn: ReturnType<typeof vi.fn>, i = 0) =>
  Object.fromEntries((fn.mock.calls[i]!.at(-1) as FormData).entries());
const submit = async (button: HTMLElement) =>
  act(async () => void fireEvent.click(button));

beforeEach(() => {
  for (const f of Object.values(actions)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: null });
  }
  upload.uploadFile.mockReset();
  router.refresh.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const products: ProductItem[] = [
  {
    id: "p1",
    name: "T-shirt de la tournée",
    status: "ON_SALE",
    featured: true,
    imageUrl: "https://files.example/p1.png",
    price: "25 €",
    priceSort: 2500,
    stock: 0,
    sold: 12,
    variants: 3,
    href: "/o/club/shop/products/p1",
  },
  {
    id: "p2",
    name: "Sweat",
    status: "DRAFT",
    featured: false,
    imageUrl: null,
    price: "à partir de 40 €",
    priceSort: 4000,
    stock: null,
    sold: 0,
    variants: 2,
    href: "/o/club/shop/products/p2",
  },
  {
    id: "p3",
    name: "Affiche",
    status: "ARCHIVED",
    featured: false,
    imageUrl: null,
    price: "15 €",
    priceSort: 1500,
    stock: 4,
    sold: 1,
    variants: 1,
    href: "/o/club/shop/products/p3",
  },
];

describe("Boutique, onglet Produits", () => {
  it("catalogue : photo, prix, stock (épuisé, illimité), ventes, statut, mise en avant ; recherche par nom", () => {
    wrap(
      <ProductsTable
        rows={products}
        orgSlug="club"
        canManage
        symbol="€"
        defaultVat="21"
      />,
    );
    for (const text of [
      "T-shirt de la tournée",
      "à partir de 40 €",
      s.soldOut!,
      s.unlimited!,
      s.featured!,
      s.status_ON_SALE!,
      s.status_DRAFT!,
      s.status_ARCHIVED!,
    ])
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    const search = screen.getByPlaceholderText(s.searchProducts!);
    fireEvent.change(search, { target: { value: "SWEAT" } });
    expect(screen.queryAllByText("T-shirt de la tournée")).toHaveLength(0);
    expect(screen.getAllByText("Sweat").length).toBeGreaterThan(0);
    fireEvent.change(search, { target: { value: "chapeau" } });
    expect(screen.getByText(s.noMatch!)).toBeTruthy();
  });

  it("catalogue vide : l'état vide et « Nouveau produit », seulement pour qui gère la boutique", () => {
    const { unmount } = wrap(
      <ProductsTable
        rows={[]}
        orgSlug="club"
        canManage
        symbol="€"
        defaultVat="21"
      />,
    );
    expect(screen.getByText(s.emptyTitle!)).toBeTruthy();
    expect(screen.getByRole("button", { name: s.newProduct })).toBeTruthy();
    unmount();
    wrap(
      <ProductsTable
        rows={[]}
        orgSlug="club"
        canManage={false}
        symbol="€"
        defaultVat="21"
      />,
    );
    expect(screen.queryByRole("button", { name: s.newProduct })).toBeNull();
  });

  it("« Nouveau produit » : nom, prix, TVA proposée, stock, description ; retrait accepté par défaut ; erreur affichée", async () => {
    actions.createProductAction.mockResolvedValue({
      ok: false,
      error: "SHOP_PRICE_INVALID",
    });
    wrap(<NewProductDialog orgSlug="club" symbol="€" defaultVat="21" />);
    fireEvent.click(screen.getByRole("button", { name: s.newProduct }));
    const dialog = screen.getByRole("dialog");
    expect(
      (within(dialog).getByLabelText(/^TVA/) as HTMLInputElement).value,
    ).toBe("21");
    fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${s.name}`)), {
      target: { value: "Tote bag" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Prix \(€\)/), {
      target: { value: "0,50" },
    });
    fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${s.stock}`)), {
      target: { value: "30" },
    });
    await submit(within(dialog).getByRole("button", { name: s.create }));
    await waitFor(() => expect(actions.createProductAction).toHaveBeenCalled());
    expect(actions.createProductAction.mock.calls[0]![0]).toBe("club");
    expect(sent(actions.createProductAction)).toMatchObject({
      name: "Tote bag",
      price: "0,50",
      vatRate: "21",
      stock: "30",
      pickupEnabled: "on",
    });
    await waitFor(() =>
      expect(screen.getByText(fe.SHOP_PRICE_INVALID!)).toBeTruthy(),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: fr.common.cancel }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("aperçu de l'encart Pro : trois produits d'exemple", () => {
    wrap(<ShopPreview />);
    for (const k of ["previewItem1", "previewItem2", "previewItem3"])
      expect(screen.getByText(s[k]!)).toBeTruthy();
  });
});

const points: PickupPointItem[] = [
  {
    id: "pt1",
    name: "Accueil du théâtre",
    address: "Rue Haute 1\n1000 Bruxelles",
    instructions: "Du mardi au samedi",
    active: true,
  },
  {
    id: "pt2",
    name: "Bar",
    address: "Rue Basse 2",
    instructions: "",
    active: false,
  },
];
const methods: ShippingMethodItem[] = [
  {
    id: "m1",
    name: "Colis suivi",
    price: "4,90 €",
    priceMinor: 490,
    priceInput: "4,90",
    active: true,
  },
];

describe("Boutique, onglet « Retrait et livraison »", () => {
  it("lieux et modes : proposés ou non ; ne plus proposer, proposer ; suppression confirmée", async () => {
    wrap(
      <DeliveryView
        orgSlug="club"
        canManage
        symbol="€"
        points={points}
        methods={methods}
      />,
    );
    for (const text of [
      "Accueil du théâtre",
      "Du mardi au samedi",
      "Colis suivi",
      "4,90 €",
    ])
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    expect(screen.getAllByText(s.offered!).length).toBeGreaterThan(0);
    expect(screen.getAllByText(s.notOffered!).length).toBeGreaterThan(0);
    await submit(screen.getAllByRole("button", { name: s.stopOffering })[0]!);
    await waitFor(() =>
      expect(actions.deliveryCommandAction).toHaveBeenCalled(),
    );
    expect(actions.deliveryCommandAction.mock.calls[0]!.slice(0, 3)).toEqual([
      "club",
      "pickup",
      "pt1",
    ]);
    expect(sent(actions.deliveryCommandAction)).toEqual({ command: "disable" });
    expect(screen.getAllByRole("button", { name: s.offer }).length).toBe(1); // le bar, non proposé
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const del = screen.getAllByRole("button", { name: s.delete });
    await submit(del[2]!); // le mode de livraison
    expect(confirm).toHaveBeenCalledWith(
      fill(s.deleteConfirm!, { name: "Colis suivi" }),
    );
    expect(actions.deliveryCommandAction).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    await submit(del[2]!);
    await waitFor(() =>
      expect(actions.deliveryCommandAction).toHaveBeenCalledTimes(2),
    );
    expect(actions.deliveryCommandAction.mock.calls[1]!.slice(0, 3)).toEqual([
      "club",
      "shipping",
      "m1",
    ]);
  });

  it("ajout d'un lieu de retrait : nom, adresse, instructions ; fenêtre fermée une fois enregistré", async () => {
    wrap(
      <DeliveryView
        orgSlug="club"
        canManage
        symbol="€"
        points={[]}
        methods={[]}
      />,
    );
    expect(screen.getByText(s.pickupEmptyTitle!)).toBeTruthy();
    expect(screen.getByText(s.shippingEmptyTitle!)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: s.pickupAdd }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByLabelText(new RegExp(`^${s.pickupName}`)),
      {
        target: { value: "Accueil" },
      },
    );
    fireEvent.change(
      within(dialog).getByLabelText(new RegExp(`^${s.pickupAddress}`)),
      {
        target: { value: "Rue Haute 1" },
      },
    );
    await submit(within(dialog).getByRole("button", { name: s.add }));
    await waitFor(() =>
      expect(actions.savePickupPointAction).toHaveBeenCalled(),
    );
    expect(actions.savePickupPointAction.mock.calls[0]!.slice(0, 2)).toEqual([
      "club",
      null,
    ]);
    expect(sent(actions.savePickupPointAction)).toEqual({
      name: "Accueil",
      address: "Rue Haute 1",
      instructions: "",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("modification d'un mode de livraison : prérempli ; erreur affichée, fenêtre gardée ; annuler", async () => {
    actions.saveShippingMethodAction.mockResolvedValue({
      ok: false,
      error: "SHOP_AMOUNT_INVALID",
    });
    wrap(
      <DeliveryView
        orgSlug="club"
        canManage
        symbol="€"
        points={points}
        methods={methods}
      />,
    );
    const edits = screen.getAllByRole("button", { name: s.edit });
    fireEvent.click(edits[2]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(s.shippingEdit!)).toBeTruthy();
    const price = within(dialog).getByLabelText(
      /Prix \(€\)/,
    ) as HTMLInputElement;
    expect(price.value).toBe("4,90");
    await submit(within(dialog).getByRole("button", { name: s.save }));
    await waitFor(() =>
      expect(screen.getByText(fe.SHOP_AMOUNT_INVALID!)).toBeTruthy(),
    );
    expect(actions.saveShippingMethodAction.mock.calls[0]!.slice(0, 2)).toEqual(
      ["club", "m1"],
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: fr.common.cancel }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // modification d'un lieu, puis ajout d'un mode de livraison
    fireEvent.click(edits[0]!);
    expect(
      (
        screen.getByLabelText(
          new RegExp(`^${s.pickupName}`),
        ) as HTMLInputElement
      ).value,
    ).toBe("Accueil du théâtre");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: fr.common.cancel,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: s.shippingAdd }));
    expect(
      within(screen.getByRole("dialog")).getByText(s.shippingAdd!),
    ).toBeTruthy();
  });

  it("sans droit de gestion : ni ajout ni action", () => {
    wrap(
      <DeliveryView
        orgSlug="club"
        canManage={false}
        symbol="€"
        points={points}
        methods={methods}
      />,
    );
    expect(screen.queryByRole("button", { name: s.pickupAdd })).toBeNull();
    expect(screen.queryByRole("button", { name: s.delete })).toBeNull();
  });
});

describe("Fiche d'un produit", () => {
  it("statut : brouillon → « Mettre en vente » ou « Archiver » ; erreur affichée ; en vente, archivé, lecture seule", async () => {
    actions.productStatusAction.mockResolvedValue({
      ok: false,
      error: "SHOP_NO_PICKUP_POINT",
    });
    const { unmount } = wrap(
      <ProductStatusForm
        orgSlug="club"
        productId="p1"
        status="DRAFT"
        readOnly={false}
      />,
    );
    expect(screen.getByText(s.statusHint_DRAFT!)).toBeTruthy();
    await submit(screen.getByRole("button", { name: s.publish }));
    await waitFor(() =>
      expect(screen.getByText(fe.SHOP_NO_PICKUP_POINT!)).toBeTruthy(),
    );
    expect(actions.productStatusAction.mock.calls[0]!.slice(0, 2)).toEqual([
      "club",
      "p1",
    ]);
    expect(sent(actions.productStatusAction)).toEqual({ status: "ON_SALE" });
    expect(screen.getByRole("button", { name: s.archive })).toBeTruthy();
    unmount();
    const onSale = wrap(
      <ProductStatusForm
        orgSlug="club"
        productId="p1"
        status="ON_SALE"
        readOnly={false}
      />,
    );
    expect(screen.getByRole("button", { name: s.unpublish })).toBeTruthy();
    onSale.unmount();
    const archived = wrap(
      <ProductStatusForm
        orgSlug="club"
        productId="p1"
        status="ARCHIVED"
        readOnly={false}
      />,
    );
    expect(screen.getByRole("button", { name: s.toDraft })).toBeTruthy();
    archived.unmount();
    wrap(
      <ProductStatusForm
        orgSlug="club"
        productId="p1"
        status="ARCHIVED"
        readOnly
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("informations : préremplies, envoyées avec les modes de remise et la mise en avant ; « Enregistré »", async () => {
    wrap(
      <ProductInfoForm
        orgSlug="club"
        productId="p1"
        symbol="€"
        readOnly={false}
        info={{
          name: "T-shirt",
          description: "Coton bio",
          price: "25",
          vatRate: "21",
          pickupEnabled: true,
          shippingEnabled: false,
          featured: false,
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("switch", { name: new RegExp(s.shippingEnabled!) }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: new RegExp(s.featuredLabel!) }),
    );
    await submit(screen.getByRole("button", { name: s.save }));
    await waitFor(() => expect(actions.updateProductAction).toHaveBeenCalled());
    expect(sent(actions.updateProductAction)).toEqual({
      name: "T-shirt",
      price: "25",
      vatRate: "21",
      description: "Coton bio",
      pickupEnabled: "on",
      shippingEnabled: "on",
      featured: "on",
    });
    await waitFor(() => expect(screen.getByText(s.saved!)).toBeTruthy());
  });

  it("photos : principale en premier, commandes envoyées, retrait confirmé ; import puis ajout, erreurs lisibles", async () => {
    const images = [
      { id: "i1", url: "https://files.example/1.png", alt: "" },
      { id: "i2", url: "https://files.example/2.png", alt: "De dos" },
    ];
    wrap(
      <ProductImages
        orgSlug="club"
        productId="p1"
        name="T-shirt"
        images={images}
        readOnly={false}
      />,
    );
    expect(screen.getByAltText("T-shirt")).toBeTruthy(); // sans description : le nom du produit
    expect(screen.getByAltText("De dos")).toBeTruthy();
    expect(screen.getByText(s.mainImage!)).toBeTruthy();
    await submit(screen.getByRole("button", { name: s.makeMain }));
    await waitFor(() => expect(actions.imageCommandAction).toHaveBeenCalled());
    expect(actions.imageCommandAction.mock.calls[0]!.slice(0, 3)).toEqual([
      "club",
      "p1",
      "i2",
    ]);
    expect(sent(actions.imageCommandAction)).toEqual({
      alt: "De dos",
      command: "first",
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await submit(screen.getAllByRole("button", { name: s.remove })[0]!);
    expect(confirm).toHaveBeenCalledWith(s.removeImageConfirm);
    expect(actions.imageCommandAction).toHaveBeenCalledTimes(1);
    await submit(screen.getByRole("button", { name: s.moveLater }));
    await submit(screen.getByRole("button", { name: s.moveEarlier }));
    await waitFor(() =>
      expect(actions.imageCommandAction).toHaveBeenCalledTimes(3),
    );

    // import : deux fichiers ; le second refusé par l'import (format), message de la page Marque
    upload.uploadFile
      .mockResolvedValueOnce({ url: "https://files.example/3.png" })
      .mockResolvedValueOnce({ error: "UPLOAD_TYPE" });
    const input = document.getElementById("product-images") as HTMLInputElement;
    const file = (n: string) => new File(["x"], n, { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [file("a.png"), file("b.png")] },
      });
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(upload.uploadFile.mock.calls[0]!.slice(2)).toEqual([
      "product",
      "p1",
    ]);
    expect(actions.addImageAction).toHaveBeenCalledWith(
      "club",
      "p1",
      "https://files.example/3.png",
    );
    expect(screen.getByRole("alert").textContent).toBe(
      fr.brand.upload_UPLOAD_TYPE,
    );
    // ajout refusé par le serveur (galerie pleine), puis panne réseau
    upload.uploadFile.mockResolvedValue({ url: "https://files.example/4.png" });
    actions.addImageAction.mockResolvedValue({
      ok: false,
      error: "SHOP_TOO_MANY_IMAGES",
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("c.png")] } });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        fe.SHOP_TOO_MANY_IMAGES,
      ),
    );
    upload.uploadFile.mockRejectedValue(new Error("réseau"));
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("d.png")] } });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        fr.brand.upload_UNKNOWN,
      ),
    );
    upload.uploadFile.mockResolvedValue({ error: "INCONNU" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("e.png")] } });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        fr.brand.upload_UNKNOWN,
      ),
    );
    await act(async () => {
      fireEvent.change(input, { target: { files: [] } });
    });
    fireEvent.click(screen.getByRole("button", { name: s.addImages }));
  });

  it("photos : aucune, galerie pleine, lecture seule", () => {
    const { unmount } = wrap(
      <ProductImages
        orgSlug="club"
        productId="p1"
        name="T-shirt"
        images={[]}
        readOnly={false}
      />,
    );
    expect(screen.getByText(s.noImage!)).toBeTruthy();
    expect(screen.getByText(s.imagesLimits!)).toBeTruthy();
    unmount();
    const full = wrap(
      <ProductImages
        orgSlug="club"
        productId="p1"
        name="T-shirt"
        images={Array.from({ length: 10 }, (_, i) => ({
          id: `i${i}`,
          url: `https://files.example/${i}.png`,
          alt: "",
        }))}
        readOnly={false}
      />,
    );
    expect(screen.getByText(s.imagesFull!)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: s.addImages }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    full.unmount();
    wrap(
      <ProductImages
        orgSlug="club"
        productId="p1"
        name="T-shirt"
        images={[{ id: "i1", url: "https://files.example/1.png", alt: "" }]}
        readOnly
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("options : valeurs ajoutées par Entrée, virgule ou en quittant le champ, doublons ignorés ; combinaisons comptées ; enregistrées en entier", async () => {
    wrap(
      <ProductOptionsEditor
        orgSlug="club"
        productId="p1"
        readOnly={false}
        groups={[
          {
            id: "g1",
            name: "Taille",
            values: [
              { id: "v1", name: "S" },
              { id: "v2", name: "M" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("2 combinaisons")).toBeTruthy();
    const value = screen.getByLabelText(s.addValue!) as HTMLInputElement;
    fireEvent.change(value, { target: { value: "L" } });
    fireEvent.keyDown(value, { key: "Enter" });
    fireEvent.change(value, { target: { value: "m, XL" } }); // « m » existe déjà
    fireEvent.keyDown(value, { key: "," });
    fireEvent.change(value, { target: { value: "XXL" } });
    fireEvent.blur(value);
    fireEvent.keyDown(value, { key: "a" });
    expect(screen.getByText("5 combinaisons")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: fill(s.removeValue!, { name: "S" }) }),
    );
    expect(screen.getByText("4 combinaisons")).toBeTruthy();
    // une deuxième option, puis retirée
    fireEvent.click(screen.getByRole("button", { name: s.addOption }));
    const names = screen.getAllByLabelText(s.optionName!);
    fireEvent.change(names[1]!, { target: { value: "Couleur" } });
    const values = screen.getAllByLabelText(s.addValue!);
    fireEvent.change(values[1]!, { target: { value: "Noir, Blanc" } });
    fireEvent.keyDown(values[1]!, { key: "Enter" });
    expect(screen.getByText("8 combinaisons")).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: s.removeOption })[1]!,
    );
    await submit(screen.getByRole("button", { name: s.saveOptions }));
    await waitFor(() => expect(actions.saveOptionsAction).toHaveBeenCalled());
    expect(JSON.parse(String(sent(actions.saveOptionsAction).groups))).toEqual([
      {
        id: "g1",
        name: "Taille",
        values: [
          { id: "v2", name: "M" },
          { name: "L" },
          { name: "XL" },
          { name: "XXL" },
        ],
      },
    ]);
    await waitFor(() => expect(screen.getByText(s.saved!)).toBeTruthy());
  });

  it("options : trop de combinaisons, enregistrement bloqué ; trois options au plus ; lecture seule", () => {
    const many = (prefix: string) =>
      Array.from({ length: 5 }, (_, i) => ({
        id: `${prefix}${i}`,
        name: `${prefix}${i}`,
      }));
    const { unmount } = wrap(
      <ProductOptionsEditor
        orgSlug="club"
        productId="p1"
        readOnly={false}
        groups={[
          { id: "a", name: "A", values: many("a") },
          { id: "b", name: "B", values: many("b") },
          { id: "c", name: "C", values: many("c") },
        ]}
      />,
    );
    expect(
      screen.getByText(fill(s.tooManyVariants!, { max: 100 })),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: s.saveOptions }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: s.addOption })).toBeNull();
    unmount();
    wrap(
      <ProductOptionsEditor
        orgSlug="club"
        productId="p1"
        readOnly
        groups={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: s.saveOptions })).toBeNull();
  });

  it("variantes : stock, supplément et mise en vente de chacune ; paniers en cours et ventes rappelés", async () => {
    const variants: VariantItem[] = [
      {
        id: "v1",
        label: "S",
        price: "25 €",
        delta: "",
        stock: "5",
        held: 2,
        sold: 3,
        active: true,
      },
      {
        id: "v2",
        label: "M",
        price: "27,50 €",
        delta: "2,50",
        stock: "",
        held: 0,
        sold: 1,
        active: false,
      },
    ];
    wrap(
      <VariantsForm
        orgSlug="club"
        productId="p1"
        symbol="€"
        readOnly={false}
        variants={variants}
      />,
    );
    expect(screen.getByText("2 en cours de paiement, 3 vendus")).toBeTruthy();
    expect(screen.getByText("1 vendu")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(`${s.stock} : M`), {
      target: { value: "8" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: `${s.onSaleShort} : M` }),
    );
    await submit(screen.getByRole("button", { name: s.saveStock }));
    await waitFor(() => expect(actions.saveVariantsAction).toHaveBeenCalled());
    expect(sent(actions.saveVariantsAction)).toEqual({
      ids: "v1,v2",
      "delta.v1": "",
      "stock.v1": "5",
      "active.v1": "on",
      "delta.v2": "2,50",
      "stock.v2": "8",
      "active.v2": "on",
    });
    await waitFor(() => expect(screen.getByText(s.saved!)).toBeTruthy());
  });

  it("variante unique : « Le produit », sans supplément ; lecture seule sans bouton", () => {
    wrap(
      <VariantsForm
        orgSlug="club"
        productId="p1"
        symbol="€"
        readOnly
        variants={[
          {
            id: "v0",
            label: "",
            price: "25 €",
            delta: "",
            stock: "",
            held: 0,
            sold: 0,
            active: true,
          },
        ]}
      />,
    );
    expect(screen.getByText(s.singleVariant!)).toBeTruthy();
    expect(screen.getAllByText(s.stockTitle!).length).toBeGreaterThan(0);
    expect(
      (
        screen.getByLabelText(
          `${s.supplement} : ${s.singleVariant}`,
        ) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: s.saveStock })).toBeNull();
  });

  it("suppression : jamais vendu, confirmée ; vendu, l'archivage est proposé", async () => {
    const { unmount } = wrap(
      <DeleteProduct orgSlug="club" productId="p1" name="T-shirt" sold />,
    );
    expect(screen.getByText(s.deleteSold!)).toBeTruthy();
    unmount();
    wrap(
      <DeleteProduct
        orgSlug="club"
        productId="p1"
        name="T-shirt"
        sold={false}
      />,
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await submit(screen.getByRole("button", { name: s.deleteProduct }));
    expect(confirm).toHaveBeenCalledWith(
      fill(s.deleteProductConfirm!, { name: "T-shirt" }),
    );
    expect(actions.deleteProductAction).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await submit(screen.getByRole("button", { name: s.deleteProduct }));
    await waitFor(() =>
      expect(actions.deleteProductAction.mock.calls[0]!.slice(0, 2)).toEqual([
        "club",
        "p1",
      ]),
    );
  });
});
