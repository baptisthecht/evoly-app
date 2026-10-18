import { estimateBankFee, EUR_TERMS, resaleAmounts } from "@evoly/core";
import { formatMoney } from "@evoly/i18n";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { HolderEditor } from "@/components/public/HolderEditor";
import { ResaleControl } from "@/components/public/ResaleControl";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({ createListingAction: vi.fn(), withdrawListingAction: vi.fn(), updateHolderAction: vi.fn() }));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const r = fr.resale as Record<string, string>;
const o = fr.orders as Record<string, string>;
const knownError = Object.keys(r).find((k) => k.startsWith("error_") && k !== "error_UNKNOWN")!;
const money = (v: number) => formatMoney(v, "EUR", "fr", { trimZeroCents: true });
const fill = (msg: string, vars: Record<string, string>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), msg);
// espaces insécables des montants et de la ponctuation française : comparés après la même normalisation des deux côtés
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const has = (text: string) => screen.getByText((content) => norm(content) === norm(text));
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  router.refresh.mockReset();
});

const resale = (over: Partial<Parameters<typeof ResaleControl>[0]> = {}) =>
  render(
    <Fr>
      <ResaleControl token="jeton" ticketId="t1" currency="EUR" faceValueMinor={2_500} terms={EUR_TERMS.free} listing={null} canResell {...over} />
    </Fr>,
  );
const openResale = () => fireEvent.click(screen.getByRole("button", { name: r.resell }));
const priceInput = () => screen.getByRole("textbox") as HTMLInputElement;
const listButton = () => screen.getByRole("button", { name: r.list }) as HTMLButtonElement;

describe("revente d'un billet par son acheteur (section 9.13)", () => {
  it("annonce en vente : prix, lien à partager, retrait ; un retrait refusé est expliqué", async () => {
    resale({ listing: { id: "l1", status: "ACTIVE", priceMinor: 2_000, url: "https://club.evoly.me/r/abc" } });
    has(fill(r.listedAt!, { price: money(2_000) }));
    expect(screen.getByTestId("resale-url").textContent).toBe("https://club.evoly.me/r/abc");
    actions.withdrawListingAction.mockResolvedValue({ ok: false, error: knownError.slice(6) });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: r.withdraw })));
    expect((await screen.findByRole("alert")).textContent).toBe(r[knownError]);
    actions.withdrawListingAction.mockResolvedValue({ ok: true });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: r.withdraw })));
    expect(actions.withdrawListingAction).toHaveBeenLastCalledWith("jeton", "l1");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("annonce gratuite réservée par un acheteur : pas de retrait possible", () => {
    resale({ listing: { id: "l1", status: "RESERVED", priceMinor: 0, url: "https://club.evoly.me/r/abc" } });
    has(r.listedFree!);
    has(r.reservedNow!);
    expect(screen.queryByRole("button", { name: r.withdraw })).toBeNull();
  });

  it("billet non revendable : rien n'est affiché", () => {
    const { container } = resale({ canResell: false });
    expect(container.textContent).toBe("");
  });

  it("montant récupéré calculé avec les règles de revente, frais détaillés", () => {
    resale();
    openResale();
    expect(priceInput().value).toBe("25");
    fireEvent.change(priceInput(), { target: { value: "20" } });
    const a = resaleAmounts(2_000, EUR_TERMS.free, estimateBankFee(2_000));
    has(fill(r.youGetBack!, { amount: money(a.sellerRefundMinor) }));
    expect(screen.getByText((c) => norm(c).includes(norm(money(a.commissionMinor))) && norm(c).includes(norm(money(a.bankFeeMinor))))).toBeTruthy();
    expect(listButton().disabled).toBe(false);
  });

  it("prix au-dessus de la valeur faciale ou illisible : refusé, bouton désactivé", () => {
    resale();
    openResale();
    fireEvent.change(priceInput(), { target: { value: "30" } });
    has(fill(r.aboveFaceValue!, { max: money(2_500) }));
    expect(listButton().disabled).toBe(true);
    fireEvent.change(priceInput(), { target: { value: "vingt" } });
    has(r.priceInvalid!);
    expect(listButton().disabled).toBe(true);
  });

  it("transfert gratuit : possible, sans frais affichés", () => {
    resale();
    openResale();
    fireEvent.change(priceInput(), { target: { value: "0" } });
    has(r.freeTransfer!);
    expect(listButton().disabled).toBe(false);
  });

  it("mise en vente : prix transmis, page rafraîchie ; refus expliqué ; annuler referme", async () => {
    resale();
    openResale();
    fireEvent.change(priceInput(), { target: { value: "22,50" } });
    actions.createListingAction.mockResolvedValue({ ok: false, error: "INCONNUE" });
    await act(async () => void fireEvent.click(listButton()));
    expect((await screen.findByRole("alert")).textContent).toBe(r.error_UNKNOWN);
    actions.createListingAction.mockResolvedValue({ ok: true });
    await act(async () => void fireEvent.click(listButton()));
    expect(actions.createListingAction).toHaveBeenLastCalledWith("jeton", "t1", "22,50");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: r.cancel }));
    expect(screen.getByRole("button", { name: r.resell })).toBeTruthy();
  });
});

const holder = (first = "Léa", last = "Martin") =>
  render(
    <Fr>
      <HolderEditor token="jeton" ticketId="t1" firstName={first} lastName={last} />
    </Fr>,
  );

describe("titulaire d'un billet (RG-QST-02)", () => {
  it("nom affiché et lien pour le changer ; sans nom, lien pour l'ajouter", () => {
    const a = holder();
    expect(screen.getByText("Léa Martin")).toBeTruthy();
    expect(screen.getByRole("button", { name: o.changeHolder })).toBeTruthy();
    a.unmount();
    holder("", "");
    expect(screen.getByRole("button", { name: o.addHolder })).toBeTruthy();
  });

  it("enregistrement : nom transmis, édition refermée, page rafraîchie", async () => {
    actions.updateHolderAction.mockResolvedValue({ ok: true });
    holder();
    fireEvent.click(screen.getByRole("button", { name: o.changeHolder }));
    fireEvent.change(screen.getByLabelText(o.holderFirstName!), { target: { value: "Zoé" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: o.saveHolder })));
    expect(actions.updateHolderAction).toHaveBeenCalledWith("jeton", "t1", { firstName: "Zoé", lastName: "Martin" });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.queryByLabelText(o.holderFirstName!)).toBeNull();
  });

  it("refus : erreur annoncée, édition gardée ; annuler referme", async () => {
    actions.updateHolderAction.mockResolvedValue({ ok: false, error: "HOLDER_NAME_REQUIRED" });
    holder();
    fireEvent.click(screen.getByRole("button", { name: o.changeHolder }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: o.saveHolder })));
    expect((await screen.findByRole("alert")).textContent).toBe(o.holderError);
    fireEvent.click(screen.getByRole("button", { name: o.cancel }));
    expect(screen.getByRole("button", { name: o.changeHolder })).toBeTruthy();
  });
});
