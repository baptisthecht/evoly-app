import { unitDiscount } from "@evoly/core";
import { formatMoney } from "@evoly/i18n";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fr from "../../../../packages/i18n/messages/fr.json";
import { TicketPicker, type PickerTicket } from "@/components/public/TicketPicker";
import { Fr } from "./intl";

const actions = vi.hoisted(() => ({
  botChallengeAction: vi.fn(),
  friendSeatsAction: vi.fn(),
  previewPromoAction: vi.fn(),
  reserveAction: vi.fn(),
  joinWaitlistAction: vi.fn(),
}));
vi.mock("@/app/site/[sub]/[eventSlug]/actions", () => actions);
const bot = vi.hoisted(() => ({ solveBotChallenge: vi.fn() }));
vi.mock("@/components/public/botProof", () => bot);
vi.mock("@/components/public/CheckoutPanel", () => ({
  CheckoutPanel: ({ reservation, onCancel }: { reservation: { token: string }; onCancel: () => void }) => (
    <div>
      <p>panier {reservation.token}</p>
      <button type="button" onClick={onCancel}>
        revenir
      </button>
    </div>
  ),
}));

const p = fr.public as Record<string, string>;
const c = fr.checkout as Record<string, string>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const money = (v: number) => formatMoney(v, "EUR", "fr", { trimZeroCents: true });
const tk = (id: string, over: Partial<PickerTicket> = {}): PickerTicket => ({
  id,
  name: `Tarif ${id}`,
  description: null,
  priceMinor: 1_000,
  tierName: null,
  next: null,
  remaining: 50,
  quantity: 50,
  minPerOrder: 1,
  maxPerOrder: 10,
  onSale: true,
  ...over,
});
type Props = Partial<Parameters<typeof TicketPicker>[0]>;
const draw = (props: Props = {}) =>
  render(
    <Fr>
      <TicketPicker
        tickets={[tk("A")]}
        currency="EUR"
        timeZone="Europe/Brussels"
        maxPerOrder={10}
        state="OPEN"
        checkout={{ eventId: "e1", organizationName: "Club", requirePhone: false, publishableKey: null }}
        {...props}
      />
    </Fr>,
  );
const more = (name: string) => screen.getByRole("button", { name: p.more!.replace("{name}", name) });
const less = (name: string) => screen.getByRole("button", { name: p.less!.replace("{name}", name) });
const count = (name: string) => more(name).parentElement!.querySelector("output")!.textContent;
const click = (el: HTMLElement, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(el);
};
const continueButton = () => screen.getByRole("button", { name: p.continue }) as HTMLButtonElement;
beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  bot.solveBotChallenge.mockReset();
  actions.botChallengeAction.mockResolvedValue(null);
  actions.friendSeatsAction.mockResolvedValue(null);
});
afterEach(() => window.history.pushState({}, "", "/"));

describe("choix des billets : code promo au clavier, retrait d'une option", () => {
  it("code promo : Entrée dans le champ vide ne vérifie rien ; avec un code, le fait vérifier", async () => {
    actions.previewPromoAction.mockResolvedValue({ ok: false, error: "QUELQUE_CHOSE" });
    draw();
    fireEvent.click(screen.getByRole("button", { name: c.promoToggle }));
    const field = screen.getByLabelText(c.promoLabel!);
    await act(async () => void fireEvent.keyDown(field, { key: "Enter" }));
    expect(actions.previewPromoAction).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "MOINS10" } });
    await act(async () => void fireEvent.keyDown(field, { key: "Enter" }));
    expect(actions.previewPromoAction).toHaveBeenLastCalledWith("e1", "MOINS10");
  });

  it("option : « − » inactif à zéro ; après deux ajouts, il en retire une", () => {
    draw({ options: [{ id: "o1", name: "Vestiaire", description: null, priceMinor: 200, maxPerOrder: 4, left: 5, standalone: true }] });
    const less = () => screen.getByRole("button", { name: p.optionLess!.replace("{name}", "Vestiaire") }) as HTMLButtonElement;
    const more = screen.getByRole("button", { name: p.optionMore!.replace("{name}", "Vestiaire") });
    expect(less().disabled).toBe(true);
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(less());
    const group = screen.getByRole("group", { name: p.quantityFor!.replace("{name}", "Vestiaire") });
    expect(norm(group.textContent!)).toContain("1");
    expect(less().disabled).toBe(false);
  });
});
